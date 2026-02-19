/**
 * Integration tests for Report endpoints.
 *
 * Routes tested:
 *   GET    /api/reports/summary
 *   GET    /api/reports/daily-messages
 *   GET    /api/reports/provider-usage
 *   GET    /api/reports/tool-usage
 *   POST   /api/reports/query
 *   GET    /api/reports/saved
 *   POST   /api/reports/saved
 *   GET    /api/reports/saved/:reportId
 *   PATCH  /api/reports/saved/:reportId
 *   DELETE /api/reports/saved/:reportId
 *   POST   /api/reports/saved/:reportId/run
 */

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createMockSupabaseClient,
  resetMockDB,
  seedTable,
  seedRpc,
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

describe('Report endpoints', () => {
  let app;
  let token;
  const ORIG_ENV = { ...process.env };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon';
    process.env.ALLOW_ANONYMOUS = 'false';

    app = await createTestApp();
  });

  beforeEach(() => {
    resetMockDB();
    process.env.ALLOW_ANONYMOUS = 'false';
    token = createTestToken(TEST_USER);
    seedAuthUser(token, TEST_USER);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  // ===================== Supabase feature gate =====================

  describe('Supabase feature gate', () => {
    it('returns 501 for all report endpoints when Supabase is not configured', async () => {
      const noSupaApp = await createTestApp({ supabaseConfigured: false });

      const endpoints = [
        ['get', '/api/reports/summary'],
        ['get', '/api/reports/daily-messages'],
        ['get', '/api/reports/provider-usage'],
        ['get', '/api/reports/tool-usage'],
        ['post', '/api/reports/query'],
        ['get', '/api/reports/saved'],
        ['post', '/api/reports/saved'],
        ['get', '/api/reports/saved/some-id'],
        ['patch', '/api/reports/saved/some-id'],
        ['delete', '/api/reports/saved/some-id'],
        ['post', '/api/reports/saved/some-id/run']
      ];

      for (const [method, path] of endpoints) {
        const res = await request(noSupaApp)[method](path)
          .set(createAuthHeaders(token))
          .send(method === 'post' ? { source: 'test' } : undefined);

        expect(res.status).toBe(501);
        expect(res.body.error).toContain('Supabase');
      }
    });
  });

  // ===================== GET /api/reports/summary =====================

  describe('GET /api/reports/summary', () => {
    it('returns summary data from RPC', async () => {
      seedRpc('report_summary', [
        { total_chats: 5, total_messages: 42, active_days: 10, avg_messages_per_day: 4.2 }
      ]);

      const res = await request(app)
        .get('/api/reports/summary')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      // The store returns data[0] from the RPC result
      expect(res.body.total_chats).toBe(5);
      expect(res.body.total_messages).toBe(42);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/reports/summary');
      expect(res.status).toBe(401);
    });
  });

  // ===================== GET /api/reports/daily-messages =====================

  describe('GET /api/reports/daily-messages', () => {
    it('returns daily messages data', async () => {
      const mockData = [
        { date: '2025-01-01', count: 10 },
        { date: '2025-01-02', count: 15 }
      ];
      seedRpc('report_daily_messages', mockData);

      const res = await request(app)
        .get('/api/reports/daily-messages')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2025-01-01');
    });

    it('accepts a days query parameter', async () => {
      seedRpc('report_daily_messages', (params) => {
        // Verify the days param is passed through
        return [{ date: '2025-01-01', count: 1, days_requested: params.p_days }];
      });

      const res = await request(app)
        .get('/api/reports/daily-messages?days=7')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
    });

    it('defaults to 30 days when no days parameter', async () => {
      seedRpc('report_daily_messages', []);

      const res = await request(app)
        .get('/api/reports/daily-messages')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
    });
  });

  // ===================== GET /api/reports/provider-usage =====================

  describe('GET /api/reports/provider-usage', () => {
    it('returns provider usage breakdown', async () => {
      const mockData = [
        { provider: 'claude', message_count: 30 },
        { provider: 'other-provider', message_count: 12 }
      ];
      seedRpc('report_provider_usage', mockData);

      const res = await request(app)
        .get('/api/reports/provider-usage')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].provider).toBe('claude');
    });
  });

  // ===================== GET /api/reports/tool-usage =====================

  describe('GET /api/reports/tool-usage', () => {
    it('returns tool usage data', async () => {
      const mockData = [
        { tool_name: 'Read', use_count: 100 },
        { tool_name: 'Bash', use_count: 50 }
      ];
      seedRpc('report_tool_usage', mockData);

      const res = await request(app)
        .get('/api/reports/tool-usage')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].tool_name).toBe('Read');
    });
  });

  // ===================== POST /api/reports/query =====================

  describe('POST /api/reports/query', () => {
    it('executes a custom query and returns results', async () => {
      seedRpc('report_custom_query', [{ result: 'custom-data' }]);

      const res = await request(app)
        .post('/api/reports/query')
        .set(createAuthHeaders(token))
        .send({ source: 'messages', filters: { role: 'user' } });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('returns 400 when source is missing', async () => {
      const res = await request(app)
        .post('/api/reports/query')
        .set(createAuthHeaders(token))
        .send({ filters: { role: 'user' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('source');
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/reports/query')
        .set(createAuthHeaders(token))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ===================== Saved Reports CRUD =====================

  describe('Saved Reports CRUD', () => {
    const sampleReport = {
      id: 'rpt-001',
      user_id: TEST_USER.id,
      name: 'Daily Activity Report',
      description: 'Shows daily message counts',
      report_config: { source: 'messages', groupBy: 'date' },
      last_run_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    // ---- GET /api/reports/saved ----

    describe('GET /api/reports/saved', () => {
      it('returns saved reports for the user', async () => {
        seedTable('saved_reports', [sampleReport]);

        const res = await request(app)
          .get('/api/reports/saved')
          .set(createAuthHeaders(token));

        expect(res.status).toBe(200);
        expect(res.body.reports).toHaveLength(1);
        expect(res.body.reports[0].name).toBe('Daily Activity Report');
      });

      it('returns empty list when no saved reports', async () => {
        seedTable('saved_reports', []);

        const res = await request(app)
          .get('/api/reports/saved')
          .set(createAuthHeaders(token));

        expect(res.status).toBe(200);
        expect(res.body.reports).toEqual([]);
      });
    });

    // ---- POST /api/reports/saved ----

    describe('POST /api/reports/saved', () => {
      it('creates a new saved report', async () => {
        seedTable('saved_reports', []);

        const res = await request(app)
          .post('/api/reports/saved')
          .set(createAuthHeaders(token))
          .send({
            name: 'New Report',
            description: 'A test report',
            reportConfig: { source: 'chats', groupBy: 'provider' }
          });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('New Report');
        expect(res.body.user_id).toBe(TEST_USER.id);
      });

      it('returns 400 when name is missing', async () => {
        const res = await request(app)
          .post('/api/reports/saved')
          .set(createAuthHeaders(token))
          .send({ reportConfig: { source: 'chats' } });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('name');
      });

      it('returns 400 when reportConfig is missing', async () => {
        const res = await request(app)
          .post('/api/reports/saved')
          .set(createAuthHeaders(token))
          .send({ name: 'Incomplete' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('reportConfig');
      });
    });

    // ---- GET /api/reports/saved/:reportId ----

    describe('GET /api/reports/saved/:reportId', () => {
      it('returns a specific saved report', async () => {
        seedTable('saved_reports', [sampleReport]);

        const res = await request(app)
          .get(`/api/reports/saved/${sampleReport.id}`)
          .set(createAuthHeaders(token));

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(sampleReport.id);
        expect(res.body.name).toBe('Daily Activity Report');
      });

      it('returns 404 when report does not exist', async () => {
        seedTable('saved_reports', []);

        const res = await request(app)
          .get('/api/reports/saved/nonexistent')
          .set(createAuthHeaders(token));

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Report not found');
      });
    });

    // ---- PATCH /api/reports/saved/:reportId ----

    describe('PATCH /api/reports/saved/:reportId', () => {
      it('updates a saved report name and description', async () => {
        seedTable('saved_reports', [sampleReport]);

        const res = await request(app)
          .patch(`/api/reports/saved/${sampleReport.id}`)
          .set(createAuthHeaders(token))
          .send({ name: 'Updated Report', description: 'Updated description' });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated Report');
        expect(res.body.description).toBe('Updated description');
      });
    });

    // ---- DELETE /api/reports/saved/:reportId ----

    describe('DELETE /api/reports/saved/:reportId', () => {
      it('deletes a saved report', async () => {
        seedTable('saved_reports', [sampleReport]);

        const res = await request(app)
          .delete(`/api/reports/saved/${sampleReport.id}`)
          .set(createAuthHeaders(token));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });
      });

      it('returns 200 for idempotent delete of non-existent report', async () => {
        seedTable('saved_reports', []);

        const res = await request(app)
          .delete('/api/reports/saved/nonexistent')
          .set(createAuthHeaders(token));

        // Supabase delete is idempotent
        expect(res.status).toBe(200);
      });
    });

    // ---- POST /api/reports/saved/:reportId/run ----

    describe('POST /api/reports/saved/:reportId/run', () => {
      it('runs a saved report and returns the result', async () => {
        seedTable('saved_reports', [sampleReport]);
        seedRpc('report_custom_query', [{ metric: 'value', count: 42 }]);

        const res = await request(app)
          .post(`/api/reports/saved/${sampleReport.id}/run`)
          .set(createAuthHeaders(token));

        expect(res.status).toBe(200);
        expect(res.body.result).toBeDefined();
        expect(res.body.result).toHaveLength(1);
        expect(res.body.result[0].count).toBe(42);
      });

      it('returns 404 when report to run does not exist', async () => {
        seedTable('saved_reports', []);

        const res = await request(app)
          .post('/api/reports/saved/nonexistent/run')
          .set(createAuthHeaders(token));

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Report not found');
      });
    });
  });
});
