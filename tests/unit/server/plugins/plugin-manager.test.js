import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from '../../../../server/plugins/plugin-manager.js';

const pluginsRoot = path.resolve(process.cwd(), 'plugins');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createPluginFixture({ dirName, manifest, mcpConfig }) {
  const dir = path.join(pluginsRoot, dirName);
  writeJson(path.join(dir, '.claude-plugin', 'plugin.json'), manifest);
  if (mcpConfig !== undefined) {
    writeJson(path.join(dir, '.mcp.json'), mcpConfig);
  }
  return dir;
}

describe('PluginManager', () => {
  let settings;
  const writtenPluginDirs = new Set();

  const readSettings = () => settings;
  const writeSettings = (next) => { settings = next; };
  const nextPluginName = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  beforeEach(() => {
    settings = { plugins: { enabled: [], installed: [] } };
    writtenPluginDirs.clear();
    process.env.PLUGIN_ALLOW_LOCAL_MCP = 'false';
    delete process.env.PLUGIN_MCP_HOST_ALLOWLIST;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const dir of Array.from(writtenPluginDirs)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
    delete process.env.PLUGIN_ALLOW_LOCAL_MCP;
  });

  it('rejects plugin git URLs that include credentials', () => {
    const manager = new PluginManager({ readSettings, writeSettings });

    expect(() => manager.installPlugin('https://alice:secret@github.com/org/alpha.git')).toThrow(
      /must not include credentials/
    );
  });

  it('defaults to blocking plugin local MCP execution', () => {
    const dirName = nextPluginName('plugin-local');
    createPluginFixture({
      dirName,
      manifest: { name: dirName },
      mcpConfig: {
        local: {
          command: 'node',
          args: ['server.js']
        }
      }
    });
    writtenPluginDirs.add(path.join(pluginsRoot, dirName));

    settings.plugins.enabled.push(dirName);
    const manager = new PluginManager({ readSettings, writeSettings });

    const mcpServers = manager.getEnabledMcpServers();
    expect(mcpServers).toEqual({});
  });

  it('allows plugin local MCP execution only when explicitly enabled', () => {
    const dirName = nextPluginName('plugin-local');
    createPluginFixture({
      dirName,
      manifest: { name: dirName },
      mcpConfig: {
        local: {
          command: 'node',
          args: ['server.js']
        }
      }
    });
    writtenPluginDirs.add(path.join(pluginsRoot, dirName));

    settings.plugins.enabled.push(dirName);
    process.env.PLUGIN_ALLOW_LOCAL_MCP = 'true';

    const manager = new PluginManager({ readSettings, writeSettings });
    const mcpServers = manager.getEnabledMcpServers();

    expect(Object.keys(mcpServers)).toEqual([`plugin_${dirName}_local`]);
    expect(mcpServers[`plugin_${dirName}_local`]).toEqual({
      type: 'local',
      command: 'node',
      args: ['server.js']
    });
  });

  it('skips malformed MCP URL configs while keeping valid entries', () => {
    const dirName = nextPluginName('plugin-url');
    createPluginFixture({
      dirName,
      manifest: { name: dirName },
      mcpConfig: {
        invalid: {
          url: 'https://%zz'
        },
        valid: {
          url: 'https://example.com/mcp'
        }
      }
    });
    writtenPluginDirs.add(path.join(pluginsRoot, dirName));

    settings.plugins.enabled.push(dirName);
    const manager = new PluginManager({ readSettings, writeSettings });
    const mcpServers = manager.getEnabledMcpServers();

    expect(mcpServers).toEqual({
      [`plugin_${dirName}_valid`]: {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: {}
      }
    });
  });
});
