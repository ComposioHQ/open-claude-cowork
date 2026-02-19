import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Correctly locate user-settings.json relative to this utility file.
const USER_SETTINGS_PATH = path.join(__dirname, '..', 'user-settings.json');
const USER_SETTINGS_CACHE_TTL_MS = 5000;

const userSettingsCache = { value: null, loadedAt: 0 };

export function isSecureMode() {
  return process.env.NODE_ENV === 'production' || process.env.SETTINGS_STRICT_MODE === 'true';
}

export function cloneSettings(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

export function getUserSettingsPath() {
  const candidatePath = process.env.USER_SETTINGS_PATH || USER_SETTINGS_PATH;
  const resolved = path.resolve(candidatePath);
  const baseDir = path.resolve(path.dirname(resolved));
  if (isSecureMode() && !resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid user settings path');
  }
  return resolved;
}

export function readUserSettingsFromDisk() {
  const settingsPath = getUserSettingsPath();
  let data = { apiKeys: {}, mcpServers: [] };
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      data = JSON.parse(raw);
    }
  } catch (_) {
    // ignore and fall back to defaults
  }

  if (!data.apiKeys || typeof data.apiKeys !== 'object') data.apiKeys = {};
  if (!Array.isArray(data.mcpServers)) data.mcpServers = [];

  return normalizeUserSettings(data);
}

export function normalizeUserSettings(raw) {
  const baseOutputDir = path.join(os.homedir(), 'Documents', 'generated');
  const input = raw && typeof raw === 'object' ? raw : {};
  const apiKeys = input.apiKeys && typeof input.apiKeys === 'object' ? input.apiKeys : {};

  const permissions = input.permissions && typeof input.permissions === 'object' ? input.permissions : {};
  const browser = input.browser && typeof input.browser === 'object' ? input.browser : {};
  const documents = input.documents && typeof input.documents === 'object' ? input.documents : {};
  const instructions = input.instructions && typeof input.instructions === 'object' ? input.instructions : {};
  const plugins = input.plugins && typeof input.plugins === 'object' ? input.plugins : {};

  return {
    apiKeys: {
      anthropic: typeof apiKeys.anthropic === 'string' ? apiKeys.anthropic : '',
      composio: typeof apiKeys.composio === 'string' ? apiKeys.composio : '',
      smithery: typeof apiKeys.smithery === 'string' ? apiKeys.smithery : '',
      dataforseoUsername: typeof apiKeys.dataforseoUsername === 'string' ? apiKeys.dataforseoUsername : '',
      dataforseoPassword: typeof apiKeys.dataforseoPassword === 'string' ? apiKeys.dataforseoPassword : '',
      postiz: typeof apiKeys.postiz === 'string' ? apiKeys.postiz : ''
    },
    mcpServers: Array.isArray(input.mcpServers) ? input.mcpServers : [],
    browser: {
      enabled: !!browser.enabled,
      mode: browser.mode || 'clawd',
      headless: !!browser.headless,
      backend: browser.backend || 'builtin',
      cdpPort: Number(browser.cdpPort) || 9222
    },
    instructions: {
      global: typeof instructions.global === 'string' ? instructions.global : '',
      folders: Array.isArray(instructions.folders) ? instructions.folders : []
    },
    permissions: {
      mode: typeof permissions.mode === 'string' ? permissions.mode : 'bypassPermissions',
      allowedDirectories: Array.isArray(permissions.allowedDirectories) ? permissions.allowedDirectories : [],
      fileDeleteConfirmation: permissions.fileDeleteConfirmation !== false
    },
    documents: {
      outputDirectory: typeof documents.outputDirectory === 'string' ? documents.outputDirectory : baseOutputDir
    },
    plugins: {
      enabled: Array.isArray(plugins.enabled) ? plugins.enabled : [],
      installed: Array.isArray(plugins.installed) ? plugins.installed : []
    }
  };
}

export function clearUserSettingsCache() {
  userSettingsCache.value = null;
  userSettingsCache.loadedAt = 0;
}

export function readUserSettingsFile({ force = false } = {}) {
  const now = Date.now();
  if (!force && userSettingsCache.value && now - userSettingsCache.loadedAt < USER_SETTINGS_CACHE_TTL_MS) {
    return cloneSettings(userSettingsCache.value);
  }
  const normalized = readUserSettingsFromDisk();
  userSettingsCache.value = normalized;
  userSettingsCache.loadedAt = now;
  return cloneSettings(normalized);
}
