import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugins live at project_root/plugins/
const PLUGINS_DIR = path.resolve(__dirname, '..', '..', 'plugins');
const DEFAULT_GIT_INSTALL_ALLOWLIST = ['github.com', 'gitlab.com', 'bitbucket.org'];
const ALLOWED_LOCAL_COMMANDS = new Set(['npx', 'node', 'python', 'python3', 'bun', 'deno', 'uvx']);
const PLUGIN_DISCOVERY_CACHE_MS = Math.max(1_000, Number(process.env.PLUGIN_DISCOVERY_CACHE_MS || 30_000));

/**
 * Manages plugin discovery, installation, and configuration.
 * Plugins follow the Anthropic .claude-plugin format:
 *   plugins/<name>/.claude-plugin/plugin.json  — manifest
 *   plugins/<name>/.mcp.json                   — MCP tool connections
 *   plugins/<name>/commands/                   — slash commands (markdown)
 *   plugins/<name>/skills/                     — domain knowledge (markdown)
 */
export class PluginManager {
  /**
   * @param {Object} opts
   * @param {Function} opts.readSettings  — returns user-settings object
   * @param {Function} opts.writeSettings — persists user-settings object
   */
  constructor({ readSettings, writeSettings }) {
    this._readSettings = readSettings;
    this._writeSettings = writeSettings;
    this._discoveryCache = { at: 0, plugins: [] };
    // Ensure plugins directory exists
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    }
  }

  // ── Discovery ───────────────────────────────────────

  _invalidateDiscoveryCache() {
    this._discoveryCache = { at: 0, plugins: [] };
  }

  _isDiscoveryCacheValid() {
    return this._discoveryCache.at > 0 && (Date.now() - this._discoveryCache.at) < PLUGIN_DISCOVERY_CACHE_MS;
  }

  _refreshDiscoveryCache() {
    const results = [];
    if (!fs.existsSync(PLUGINS_DIR)) {
      this._discoveryCache = { at: Date.now(), plugins: [] };
      return;
    }

    for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = this._readManifest(entry.name);
      if (!manifest) continue;
      const dirName = entry.name;
      results.push({
        name: manifest.name || dirName,
        dirName,
        manifest,
        hasMcp: fs.existsSync(path.join(PLUGINS_DIR, dirName, '.mcp.json')),
        hasSkills: fs.existsSync(path.join(PLUGINS_DIR, dirName, 'skills')),
        hasCommands: fs.existsSync(path.join(PLUGINS_DIR, dirName, 'commands'))
      });
    }

    this._discoveryCache = {
      at: Date.now(),
      plugins: results
    };
  }

  /**
   * Scan the plugins/ directory for installed plugins.
   * Returns an array of { name, manifest, enabled } objects.
   */
  discover() {
    if (!this._isDiscoveryCacheValid()) {
      this._refreshDiscoveryCache();
    }

    return this._discoveryCache.plugins.map((plugin) => ({
      ...plugin,
      enabled: this._isEnabled(plugin.name)
    }));
  }

  _normalizeDirName(rawDirName) {
    const value = String(rawDirName || '').trim();
    if (!value) {
      throw new Error('Invalid plugin directory name');
    }

    const normalized = value
      .replace(/\.git$/i, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 64);

    if (!normalized || normalized === '.' || normalized === '..' || normalized.includes('..')) {
      throw new Error('Invalid plugin directory name');
    }

    return normalized;
  }

  _resolvePluginPath(rawDirName) {
    const safeDirName = this._normalizeDirName(rawDirName);
    const root = path.resolve(PLUGINS_DIR);
    const target = path.resolve(root, safeDirName);

    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid plugin path');
    }

    return { safeDirName, target };
  }

  _getPluginGitAllowlist() {
    const raw = process.env.PLUGIN_GIT_INSTALL_ALLOWLIST;
    if (!raw) {
      return DEFAULT_GIT_INSTALL_ALLOWLIST;
    }
    return raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  _isAllowedHost(hostname, allowlist) {
    if (!Array.isArray(allowlist) || allowlist.length === 0) return true;

    return allowlist.some((entry) => {
      if (entry.startsWith('*.')) {
        return hostname.endsWith(entry.slice(1));
      }
      return hostname === entry;
    });
  }

  _isBlockedHost(hostname) {
    const normalized = String(hostname || '').toLowerCase();
    if (!normalized) return true;
    if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
      return true;
    }
    if (net.isIP(normalized)) {
      return true;
    }
    return false;
  }

  _validateGitUrl(rawUrl) {
    const allowlist = this._getPluginGitAllowlist();
    const parsed = new URL(rawUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Plugin git URL must use http or https');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Plugin git URL must not include credentials');
    }

    const host = parsed.hostname.toLowerCase();
    if (!host) {
      throw new Error('Plugin git URL is missing host');
    }
    if (this._isBlockedHost(host) || !this._isAllowedHost(host, allowlist)) {
      throw new Error('Plugin git host is not allowed');
    }

    return parsed.toString();
  }

  _getMcpHostAllowlist() {
    const raw = process.env.PLUGIN_MCP_HOST_ALLOWLIST;
    if (!raw) return [];
    return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  }

  _isLocalMcpEnabled() {
    return process.env.PLUGIN_ALLOW_LOCAL_MCP === 'true';
  }

  _normalizeMcpServerName(name, pluginName) {
    const safePlugin = String(pluginName || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 32) || 'plugin';
    const safeServer = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
    if (!safeServer) return `plugin_${safePlugin}`.slice(0, 128);
    return `plugin_${safePlugin}_${safeServer}`.slice(0, 128);
  }

  _coerceHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
    const result = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key || typeof key !== 'string') continue;
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') continue;
      result[key] = String(value);
    }
    return result;
  }

  _sanitizeMcpConfig(_pluginName, _serverName, config) {
    if (!config || typeof config !== 'object') return null;

    const hostAllowlist = this._getMcpHostAllowlist();
    if (typeof config.command === 'string') {
      if (!this._isLocalMcpEnabled()) return null;

      const command = config.command.trim();
      if (!ALLOWED_LOCAL_COMMANDS.has(command)) return null;

      const args = Array.isArray(config.args)
        ? config.args.filter((arg) => typeof arg === 'string')
        : [];

      const environment = this._coerceHeaders(config.environment);

      return {
        type: 'local',
        command,
        ...(args.length ? { args } : {}),
        ...(Object.keys(environment).length ? { environment } : {})
      };
    }

    if (typeof config.url === 'string') {
      let parsed;
      try {
        parsed = new URL(config.url);
      } catch {
        return null;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) return null;

      const host = parsed.hostname.toLowerCase();
      if (!this._isBlockedHost(host)) {
        if (this._isAllowedHost(host, hostAllowlist)) {
          return {
            type: 'http',
            url: parsed.toString(),
            headers: this._coerceHeaders(config.headers)
          };
        }
      }
      return null;
    }

    return null;
  }

  /**
   * List all plugins with their enabled/disabled status.
   */
  listPlugins() {
    return this.discover().map(p => ({
      name: p.name,
      dirName: p.dirName,
      version: p.manifest.version || '0.0.0',
      author: p.manifest.author || 'Unknown',
      description: p.manifest.description || '',
      icon: p.manifest.icon || 'puzzle',
      category: p.manifest.category || 'general',
      enabled: p.enabled,
      agents: p.manifest.agents ? Object.keys(p.manifest.agents) : [],
      hasMcp: p.hasMcp,
      hasSkills: p.hasSkills,
      hasCommands: p.hasCommands
    }));
  }

  // ── Enable / Disable ────────────────────────────────

  enablePlugin(name) {
    const plugin = this._findInstalledPlugin(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" not found`);
    }

    const settings = this._readSettings();
    if (!settings.plugins) settings.plugins = { enabled: [], installed: [] };
    if (!settings.plugins.enabled.includes(plugin.name)) {
      settings.plugins.enabled.push(plugin.name);
    }
    this._writeSettings(settings);
    this._invalidateDiscoveryCache();
    return true;
  }

  disablePlugin(name) {
    const plugin = this._findInstalledPlugin(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" not found`);
    }

    const settings = this._readSettings();
    if (!settings.plugins) return true;
    settings.plugins.enabled = (settings.plugins.enabled || []).filter(n => n !== plugin.name);
    this._writeSettings(settings);
    this._invalidateDiscoveryCache();
    return true;
  }

  // ── Install / Remove ────────────────────────────────

  /**
   * Install a plugin from a git URL (clones into plugins/).
   * @param {string} gitUrl — e.g. https://github.com/anthropics/claude-plugin-productivity.git
   * @param {string} [dirName] — optional directory name override
   * @returns {{ name, manifest }} on success
   */
  installPlugin(gitUrl, dirName) {
    if (!gitUrl || typeof gitUrl !== 'string') {
      throw new Error('Invalid git URL');
    }

    const normalizedUrl = this._validateGitUrl(gitUrl);
    const parsedUrl = new URL(normalizedUrl);
    const suggestedName = (parsedUrl.pathname || '').split('/').filter(Boolean).pop();
    const rawName = dirName || suggestedName || 'plugin';
    const { safeDirName, target } = this._resolvePluginPath(rawName);

    if (fs.existsSync(target)) {
      throw new Error(`Plugin directory "${safeDirName}" already exists. Remove it first.`);
    }

    try {
      execFileSync('git', ['clone', '--depth', '1', normalizedUrl, target], { stdio: 'pipe', timeout: 60000 });
    } catch (err) {
      throw new Error(`Failed to clone plugin: ${err.message}`);
    }

    const manifest = this._readManifest(safeDirName);
    if (!manifest) {
      // Clean up — not a valid plugin
      fs.rmSync(target, { recursive: true, force: true });
      throw new Error('Cloned repository is not a valid plugin (missing .claude-plugin/plugin.json)');
    }

    const pluginName = manifest.name || safeDirName;

    // Optionally verify mcp config structure to catch malformed plugin installs
    const pluginServers = this._readPluginMcpConfigs(safeDirName);
    if (Object.keys(pluginServers).length === 0) {
      console.info(`[Plugins] Plugin ${pluginName} installed without MCP config`);
    }

    // Track installation
    const settings = this._readSettings();
    if (!settings.plugins) settings.plugins = { enabled: [], installed: [] };
    if (!settings.plugins.installed) settings.plugins.installed = [];
    settings.plugins.installed = settings.plugins.installed.filter(p => p.name !== pluginName);
    settings.plugins.installed.push({
      name: pluginName,
      source: normalizedUrl,
      installedAt: new Date().toISOString()
    });
    // Auto-enable
    if (!settings.plugins.enabled) settings.plugins.enabled = [];
    if (!settings.plugins.enabled.includes(pluginName)) {
      settings.plugins.enabled.push(pluginName);
    }
    this._writeSettings(settings);
    this._invalidateDiscoveryCache();

    return { name: pluginName, manifest };
  }

  /**
   * Remove an installed plugin by directory name.
   */
  removePlugin(dirName) {
    let plugin = this._findInstalledPlugin(dirName);
    if (!plugin) {
      const { safeDirName, target } = this._resolvePluginPath(dirName);
      if (!fs.existsSync(target)) {
        throw new Error(`Plugin "${dirName}" not found`);
      }
      plugin = { dirName: safeDirName, name: safeDirName };
    }

    const dest = path.join(PLUGINS_DIR, plugin.dirName);
    if (!fs.existsSync(dest)) {
      throw new Error(`Plugin "${dirName}" not found`);
    }

    fs.rmSync(dest, { recursive: true, force: true });

    // Clean up settings
    const settings = this._readSettings();
    if (settings.plugins) {
      settings.plugins.enabled = (settings.plugins.enabled || []).filter(n => n !== plugin.name);
      settings.plugins.installed = (settings.plugins.installed || []).filter(p => p.name !== plugin.name);
      this._writeSettings(settings);
      this._invalidateDiscoveryCache();
    }

    return true;
  }

  // ── Aggregation for Chat Handler ────────────────────

  /**
   * Get MCP server configs from all enabled plugins.
   * Returns an object { pluginName_serverName: mcpConfig, ... }
   */
  getEnabledMcpServers() {
    const mcpServers = {};
    for (const plugin of this.discover()) {
      if (!plugin.enabled) continue;
      const pluginName = plugin.manifest?.name || plugin.dirName;
      const pluginServers = this._readPluginMcpConfigs(plugin.dirName);

      for (const [rawServerName, sanitizedConfig] of Object.entries(pluginServers)) {
        const key = this._normalizeMcpServerName(rawServerName, pluginName);
        mcpServers[key] = sanitizedConfig;
      }
    }
    return mcpServers;
  }

  /**
   * Get system prompt additions from enabled plugins' skills/ directories.
   * Returns a combined string to append to the system prompt.
   */
  getSystemPromptAdditions() {
    const parts = [];
    for (const plugin of this.discover()) {
      if (!plugin.enabled) continue;
      const skillsDir = path.join(PLUGINS_DIR, plugin.dirName, 'skills');
      if (!fs.existsSync(skillsDir)) continue;

      try {
        for (const file of fs.readdirSync(skillsDir)) {
          if (!file.endsWith('.md')) continue;
          const content = fs.readFileSync(path.join(skillsDir, file), 'utf8').trim();
          if (content) {
            parts.push(`# Plugin: ${plugin.name} — ${file.replace('.md', '')}\n${content}`);
          }
        }
      } catch (err) {
        console.error(`[Plugins] Failed to read skills for ${plugin.name}:`, err.message);
      }
    }
    return parts.join('\n\n');
  }

  /**
   * Get sub-agent definitions from enabled plugins.
   * Returns an object { agentType: agentConfig, ... } for the SDK's agents option.
   */
  getAgentDefinitions() {
    const agents = {};
    for (const plugin of this.discover()) {
      if (!plugin.enabled) continue;
      if (!plugin.manifest.agents) continue;

      for (const [agentType, agentConfig] of Object.entries(plugin.manifest.agents)) {
        agents[agentType] = agentConfig;
      }
    }
    return agents;
  }

  // ── Internal Helpers ────────────────────────────────

  _findInstalledPlugin(name) {
    const plugins = this.discover();
    return plugins.find((plugin) => plugin.name === name || plugin.dirName === name);
  }

  _readManifest(dirName) {
    const manifestPath = path.join(PLUGINS_DIR, dirName, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }

  _isEnabled(name) {
    const settings = this._readSettings();
    return (settings.plugins?.enabled || []).includes(name);
  }

  _readPluginMcpConfigs(dirName) {
    const mcpPath = path.join(PLUGINS_DIR, dirName, '.mcp.json');
    if (!fs.existsSync(mcpPath)) return {};

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch (err) {
      console.error(`[Plugins] Failed to read MCP config for ${dirName}:`, err.message);
      return {};
    }

    const servers = payload.mcpServers || payload;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
      console.error(`[Plugins] Invalid MCP config shape for ${dirName}`);
      return {};
    }

    const sanitized = {};
    for (const [serverName, serverConfig] of Object.entries(servers)) {
      if (!serverName || typeof serverName !== 'string') continue;
      if (!serverConfig || typeof serverConfig !== 'object') {
        console.warn(`[Plugins] Skipping unsafe MCP server "${serverName}" from plugin ${dirName}`);
        continue;
      }

      const safeConfig = this._sanitizeMcpConfig(dirName, serverName, serverConfig);
      if (!safeConfig) {
        console.warn(`[Plugins] Skipping unsafe MCP server "${serverName}" from plugin ${dirName}`);
        continue;
      }

      sanitized[serverName] = safeConfig;
    }

    return sanitized;
  }
}
