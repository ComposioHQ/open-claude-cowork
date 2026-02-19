/**
 * Test Express app builder for integration tests.
 *
 * Instead of importing server.js (which has top-level side effects like Composio
 * init, app.listen(), and await calls), this module constructs a lightweight
 * Express app that mirrors the same routes and middleware. External stores
 * (chatStore, reportStore, jobStore, etc.) are injected as mocks, so each test
 * file controls the behavior via the existing in-memory Supabase mock.
 *
 * Usage in a test file:
 *
 *   import { createTestApp } from '../../../helpers/server-helper.js';
 *   const app = await createTestApp();
 *   const res = await request(app).get('/api/chats').set('Authorization', 'Bearer tok');
 */

import express from 'express';
import { vi } from 'vitest';

/**
 * Create a minimal Express app with the same routes as server.js.
 *
 * All Supabase-backed store modules are imported live (they already talk to the
 * mocked @supabase/supabase-js thanks to vi.mock at the top of each test file).
 *
 * Options:
 *   - supabaseConfigured (default true): controls whether Supabase feature-gates pass
 *   - overrides: object mapping module names to replacement mocks, e.g.
 *       { chatStore: { getUserChats: vi.fn() } }
 */
export async function createTestApp(opts = {}) {
  const {
    supabaseConfigured = true,
    overrides = {}
  } = opts;

  const app = express();
  app.use(express.json());

  // ---- Import real middleware (backed by mocked supabase client) ----
  const { requireAuth, requireAdmin, isAdmin } = await import(
    '../../server/supabase/auth-middleware.js'
  );

  // ---- Import store modules (backed by mocked supabase client) ----
  const chatStore   = overrides.chatStore   ?? await import('../../server/supabase/chat-store.js');
  const reportStore = overrides.reportStore ?? await import('../../server/supabase/report-store.js');
  const jobStore    = overrides.jobStore    ?? await import('../../server/supabase/job-store.js');
  const dbExplorer  = overrides.dbExplorer  ?? await import('../../server/supabase/db-explorer.js');
  const storage     = overrides.storage     ?? await import('../../server/supabase/storage.js');

  // Job scheduler trigger (mock by default to avoid real execution)
  const triggerJob = overrides.triggerJob ?? vi.fn().mockResolvedValue(undefined);

  // Supabase feature-gate
  const isSupabaseConfigured = () => supabaseConfigured;

  // ===================== CONFIG =====================
  app.get('/api/config', (_req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
  });

  // ===================== HEALTH =====================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      providers: ['claude']
    });
  });

  // ===================== PROVIDERS =====================
  app.get('/api/providers', (_req, res) => {
    res.json({ providers: ['claude'], default: 'claude' });
  });

  // ===================== CHAT CRUD =====================
  app.get('/api/chats', requireAuth, async (req, res) => {
    try {
      const chats = await chatStore.getUserChats(req.user.id);
      res.json({ chats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chats/:chatId', requireAuth, async (req, res) => {
    try {
      const chat = await chatStore.getChat(req.params.chatId, req.user.id);
      res.json(chat);
    } catch (err) {
      if (err.code === 'PGRST116') return res.status(404).json({ error: 'Chat not found' });
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chats', requireAuth, async (req, res) => {
    try {
      const { id, title, provider, model } = req.body;
      const chat = await chatStore.createChat({ id, userId: req.user.id, title, provider, model });
      res.json(chat);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/chats/:chatId', requireAuth, async (req, res) => {
    try {
      await chatStore.deleteChat(req.params.chatId, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/chats/:chatId', requireAuth, async (req, res) => {
    try {
      const { title } = req.body;
      const chat = await chatStore.updateChatTitle(req.params.chatId, req.user.id, title);
      res.json(chat);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== MESSAGES =====================
  app.post('/api/messages', requireAuth, async (req, res) => {
    try {
      const { chatId, role, content, html, metadata } = req.body;
      const msg = await chatStore.addMessage({ chatId, userId: req.user.id, role, content, html, metadata });
      res.json(msg);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== PROFILE =====================
  app.get('/api/profile', requireAuth, async (req, res) => {
    try {
      const profile = await chatStore.getProfile(req.user.id);
      res.json(profile || {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const profile = await chatStore.updateProfile(req.user.id, req.body);
      res.json(profile);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== DATABASE ACCESS =====================
  function getSupabaseProjectRef() {
    const url = process.env.SUPABASE_URL;
    if (!url || typeof url !== 'string') return null;
    try {
      const u = new URL(url.trim());
      const host = u.hostname.toLowerCase();
      if (host.endsWith('.supabase.co')) {
        const sub = host.slice(0, -'.supabase.co'.length);
        return sub || null;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  app.get('/api/database/access', requireAuth, (req, res) => {
    const configured = isSupabaseConfigured();
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim() || null;
    const projectRef = getSupabaseProjectRef();
    const dashboardUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}` : null;
    const databaseName = 'postgres';

    if (!configured) {
      return res.json({
        allowed: false,
        configured: false,
        supabaseUrl: null,
        projectRef: null,
        dashboardUrl: null,
        databaseName: null
      });
    }
    res.json({
      allowed: isAdmin(req.user?.email),
      configured: true,
      supabaseUrl,
      projectRef,
      dashboardUrl,
      databaseName
    });
  });

  // ===================== SETTINGS (stub — no file I/O) =====================
  // The settings endpoints in server.js do file I/O with user-settings.json.
  // For integration tests we provide a lightweight in-memory version.
  let settingsData = {
    apiKeys: {},
    mcpServers: [],
    browser: { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
  };

  // Allow tests to seed settings state
  app._setSettingsData = (data) => { settingsData = data; };
  app._getSettingsData = () => settingsData;

  function maskKey(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length <= 4) return '----';
    return '----' + trimmed.slice(-4);
  }

  app.get('/api/settings', (_req, res) => {
    try {
      res.json({
        apiKeys: {
          anthropic: maskKey(settingsData.apiKeys?.anthropic),
          composio: maskKey(settingsData.apiKeys?.composio),
          smithery: maskKey(settingsData.apiKeys?.smithery),
          dataforseoUsername: maskKey(settingsData.apiKeys?.dataforseoUsername),
          dataforseoPassword: maskKey(settingsData.apiKeys?.dataforseoPassword)
        },
        mcpServers: settingsData.mcpServers || [],
        browser: settingsData.browser || { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/settings', (req, res) => {
    try {
      const body = req.body || {};

      if (body.apiKeys && typeof body.apiKeys === 'object') {
        if (!settingsData.apiKeys) settingsData.apiKeys = {};
        for (const key of ['anthropic', 'composio', 'smithery', 'dataforseoUsername', 'dataforseoPassword']) {
          if (body.apiKeys[key] !== undefined) {
            settingsData.apiKeys[key] = body.apiKeys[key] ? String(body.apiKeys[key]).trim() : '';
          }
        }
      }

      if (body.mcpServers !== undefined) {
        if (!Array.isArray(body.mcpServers)) {
          return res.status(400).json({ error: 'mcpServers must be an array' });
        }
        settingsData.mcpServers = body.mcpServers.map((entry, i) => {
          const id = entry.id || `mcp_${Date.now()}_${i}`;
          const name = (entry.name || 'unnamed').replace(/[^a-zA-Z0-9_\s-]/g, '').trim() || 'unnamed';
          const type = entry.type === 'local' ? 'local' : 'http';
          const out = { id, name, type };
          if (type === 'http') {
            out.url = entry.url ? String(entry.url).trim() : '';
            out.headers = entry.headers && typeof entry.headers === 'object' ? entry.headers : {};
          } else {
            out.command = entry.command ? String(entry.command).trim() : '';
            out.args = Array.isArray(entry.args) ? entry.args : [];
            out.environment = entry.environment && typeof entry.environment === 'object' ? entry.environment : {};
          }
          return out;
        });
      }

      if (body.browser && typeof body.browser === 'object') {
        if (!settingsData.browser) settingsData.browser = {};
        if (body.browser.enabled !== undefined) settingsData.browser.enabled = !!body.browser.enabled;
        if (body.browser.mode !== undefined) settingsData.browser.mode = ['clawd', 'chrome'].includes(body.browser.mode) ? body.browser.mode : 'clawd';
        if (body.browser.headless !== undefined) settingsData.browser.headless = !!body.browser.headless;
        if (body.browser.backend !== undefined) settingsData.browser.backend = ['builtin', 'agent-browser'].includes(body.browser.backend) ? body.browser.backend : 'builtin';
        if (body.browser.cdpPort !== undefined) settingsData.browser.cdpPort = parseInt(body.browser.cdpPort) || 9222;
      }

      res.json({
        apiKeys: {
          anthropic: maskKey(settingsData.apiKeys?.anthropic),
          composio: maskKey(settingsData.apiKeys?.composio),
          smithery: maskKey(settingsData.apiKeys?.smithery),
          dataforseoUsername: maskKey(settingsData.apiKeys?.dataforseoUsername),
          dataforseoPassword: maskKey(settingsData.apiKeys?.dataforseoPassword)
        },
        mcpServers: settingsData.mcpServers || [],
        browser: settingsData.browser || { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== REPORTS =====================
  app.get('/api/reports/summary', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const data = await reportStore.getSummary(req.user.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/daily-messages', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const days = parseInt(req.query.days) || 30;
      const data = await reportStore.getDailyMessages(req.user.id, days);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/provider-usage', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const days = parseInt(req.query.days) || 30;
      const data = await reportStore.getProviderUsage(req.user.id, days);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/tool-usage', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const days = parseInt(req.query.days) || 30;
      const data = await reportStore.getToolUsage(req.user.id, days);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reports/query', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const config = req.body;
      if (!config || !config.source) return res.status(400).json({ error: 'Report config with source is required' });
      const data = await reportStore.executeCustomQuery(req.user.id, config);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Saved reports CRUD
  app.get('/api/reports/saved', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const reports = await reportStore.getSavedReports(req.user.id);
      res.json({ reports });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reports/saved', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const { name, description, reportConfig } = req.body;
      if (!name || !reportConfig) return res.status(400).json({ error: 'name and reportConfig are required' });
      const report = await reportStore.createSavedReport(req.user.id, { name, description, reportConfig });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/saved/:reportId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const report = await reportStore.getSavedReport(req.params.reportId, req.user.id);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      res.json(report);
    } catch (err) {
      if (err.code === 'PGRST116') return res.status(404).json({ error: 'Report not found' });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/reports/saved/:reportId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const report = await reportStore.updateSavedReport(req.params.reportId, req.user.id, req.body);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/reports/saved/:reportId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      await reportStore.deleteSavedReport(req.params.reportId, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reports/saved/:reportId/run', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Reports require Supabase' });
    try {
      const report = await reportStore.getSavedReport(req.params.reportId, req.user.id);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      const result = await reportStore.executeCustomQuery(req.user.id, report.report_config);
      await reportStore.updateReportResult(req.params.reportId, result);
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== JOBS =====================
  app.get('/api/jobs', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      const jobs = await jobStore.getUserJobs(req.user.id);
      res.json({ jobs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/jobs', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      const job = await jobStore.createJob(req.user.id, req.body);
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/jobs/:jobId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      const job = await jobStore.getJob(req.params.jobId, req.user.id);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(job);
    } catch (err) {
      if (err.code === 'PGRST116') return res.status(404).json({ error: 'Job not found' });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/jobs/:jobId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      const job = await jobStore.updateJob(req.params.jobId, req.user.id, req.body);
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/jobs/:jobId', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      await jobStore.deleteJob(req.params.jobId, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/jobs/:jobId/executions', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      const limit = parseInt(req.query.limit) || 10;
      const executions = await jobStore.getJobExecutions(req.params.jobId, req.user.id, { limit });
      res.json({ executions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/jobs/:jobId/run', requireAuth, async (req, res) => {
    if (!isSupabaseConfigured()) return res.status(501).json({ error: 'Jobs require Supabase' });
    try {
      await triggerJob(req.params.jobId, req.user.id);
      const job = await jobStore.getJob(req.params.jobId, req.user.id);
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
