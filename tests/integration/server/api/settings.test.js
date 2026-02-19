/**
 * Integration tests for Settings endpoints.
 *
 * The real server.js settings routes do filesystem I/O (read/write user-settings.json).
 * The test app builder provides an in-memory settings store that mirrors the same
 * validation logic, so we can test the API contract without touching the filesystem.
 *
 * Routes tested:
 *   GET  /api/settings
 *   PUT  /api/settings
 */

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createMockSupabaseClient,
  resetMockDB,
  seedAuthUser
} from '../../../mocks/supabase.js';
import { TEST_USER, createTestToken, createAuthHeaders } from '../../../helpers/auth-helper.js';

// --------------- Mock Supabase ---------------
const mockClient = createMockSupabaseClient();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient)
}));

// --------------- Imports ---------------
import { createTestApp } from '../../../helpers/server-helper.js';
import request from 'supertest';

describe('Settings endpoints', () => {
  let app;
  const ORIG_ENV = { ...process.env };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon';

    app = await createTestApp();
  });

  beforeEach(() => {
    resetMockDB();
    // Reset in-memory settings to default state
    app._setSettingsData({
      apiKeys: {},
      mcpServers: [],
      browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
    });
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  // ===================== GET /api/settings =====================

  describe('GET /api/settings', () => {
    it('returns default settings when nothing is configured', async () => {
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.apiKeys).toEqual({
        anthropic: null,
        composio: null,
        smithery: null,
        dataforseoUsername: null,
        dataforseoPassword: null
      });
      expect(res.body.mcpServers).toEqual([]);
      expect(res.body.browser).toEqual({
        enabled: false,
        mode: 'clawd',
        headless: false,
        backend: 'builtin',
        cdpPort: 9222
      });
    });

    it('returns masked API keys when they are set', async () => {
      app._setSettingsData({
        apiKeys: {
          anthropic: 'sk-ant-abcdef123456',
          composio: 'comp-key-xyz',
          smithery: '',
          dataforseoUsername: null,
          dataforseoPassword: null
        },
        mcpServers: [],
        browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      // Keys should be masked (only last 4 chars visible)
      expect(res.body.apiKeys.anthropic).toContain('3456');
      expect(res.body.apiKeys.composio).toContain('xyz');
      // Empty and null keys should be null
      expect(res.body.apiKeys.smithery).toBeNull();
      expect(res.body.apiKeys.dataforseoUsername).toBeNull();
    });

    it('does not require authentication (matches server.js behavior)', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
    });

    it('returns user MCP servers', async () => {
      app._setSettingsData({
        apiKeys: {},
        mcpServers: [
          { id: 'mcp-1', name: 'Custom Server', type: 'http', url: 'https://mcp.example.com' }
        ],
        browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.mcpServers).toHaveLength(1);
      expect(res.body.mcpServers[0].name).toBe('Custom Server');
    });
  });

  // ===================== PUT /api/settings =====================

  describe('PUT /api/settings', () => {
    it('saves new API keys and returns masked values', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          apiKeys: {
            anthropic: 'sk-ant-newkey-9999',
            composio: 'comp-newkey-8888'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.apiKeys.anthropic).toContain('9999');
      expect(res.body.apiKeys.composio).toContain('8888');

      // Verify persistence by reading back
      const stored = app._getSettingsData();
      expect(stored.apiKeys.anthropic).toBe('sk-ant-newkey-9999');
      expect(stored.apiKeys.composio).toBe('comp-newkey-8888');
    });

    it('only updates provided keys, leaving others unchanged', async () => {
      app._setSettingsData({
        apiKeys: { anthropic: 'existing-key-1234' },
        mcpServers: [],
        browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });

      const res = await request(app)
        .put('/api/settings')
        .send({
          apiKeys: { composio: 'new-composio-key' }
        });

      expect(res.status).toBe(200);
      // Anthropic key should still exist (masked)
      expect(res.body.apiKeys.anthropic).toContain('1234');
      expect(res.body.apiKeys.composio).toBeTruthy();
    });

    it('clears an API key when set to empty string', async () => {
      app._setSettingsData({
        apiKeys: { anthropic: 'existing-key-1234' },
        mcpServers: [],
        browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });

      const res = await request(app)
        .put('/api/settings')
        .send({ apiKeys: { anthropic: '' } });

      expect(res.status).toBe(200);
      expect(res.body.apiKeys.anthropic).toBeNull();

      const stored = app._getSettingsData();
      expect(stored.apiKeys.anthropic).toBe('');
    });

    it('saves MCP servers array', async () => {
      const mcpServers = [
        { id: 'mcp-a', name: 'Server A', type: 'http', url: 'https://a.example.com', headers: { 'x-key': 'val' } },
        { id: 'mcp-b', name: 'Server B', type: 'local', command: 'npx', args: ['-y', 'my-server'], environment: { API_KEY: 'secret' } }
      ];

      const res = await request(app)
        .put('/api/settings')
        .send({ mcpServers });

      expect(res.status).toBe(200);
      expect(res.body.mcpServers).toHaveLength(2);
      expect(res.body.mcpServers[0].type).toBe('http');
      expect(res.body.mcpServers[0].url).toBe('https://a.example.com');
      expect(res.body.mcpServers[1].type).toBe('local');
      expect(res.body.mcpServers[1].command).toBe('npx');
    });

    it('rejects non-array mcpServers', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ mcpServers: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('mcpServers must be an array');
    });

    it('generates IDs for MCP servers without IDs', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          mcpServers: [
            { name: 'No ID Server', type: 'http', url: 'https://x.com' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.mcpServers[0].id).toBeTruthy();
      expect(res.body.mcpServers[0].name).toBe('No ID Server');
    });

    it('sanitizes MCP server names', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          mcpServers: [
            { id: 'mcp-1', name: 'My <script>Server!', type: 'http', url: 'https://x.com' }
          ]
        });

      expect(res.status).toBe(200);
      // Special chars should be stripped
      expect(res.body.mcpServers[0].name).not.toContain('<');
      expect(res.body.mcpServers[0].name).not.toContain('>');
    });

    it('updates browser settings', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          browser: {
            enabled: true,
            mode: 'chrome',
            headless: true,
            backend: 'agent-browser',
            cdpPort: 9333
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.browser.enabled).toBe(true);
      expect(res.body.browser.mode).toBe('chrome');
      expect(res.body.browser.headless).toBe(true);
      expect(res.body.browser.backend).toBe('agent-browser');
      expect(res.body.browser.cdpPort).toBe(9333);
    });

    it('validates browser mode values', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          browser: { mode: 'invalid-mode' }
        });

      expect(res.status).toBe(200);
      // Invalid mode should default to 'clawd'
      expect(res.body.browser.mode).toBe('clawd');
    });

    it('validates browser backend values', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          browser: { backend: 'invalid-backend' }
        });

      expect(res.status).toBe(200);
      // Invalid backend should default to 'builtin'
      expect(res.body.browser.backend).toBe('builtin');
    });

    it('handles combined API keys + MCP servers + browser update', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          apiKeys: { anthropic: 'sk-combined-0001' },
          mcpServers: [{ id: 'srv', name: 'Srv', type: 'http', url: 'https://s.com' }],
          browser: { enabled: true }
        });

      expect(res.status).toBe(200);
      expect(res.body.apiKeys.anthropic).toContain('0001');
      expect(res.body.mcpServers).toHaveLength(1);
      expect(res.body.browser.enabled).toBe(true);
    });
  });
});
