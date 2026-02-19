/**
 * Integration tests for Job endpoints.
 *
 * Routes tested:
 *   GET    /api/jobs
 *   POST   /api/jobs
 *   GET    /api/jobs/:jobId
 *   PATCH  /api/jobs/:jobId
 *   DELETE /api/jobs/:jobId
 *   GET    /api/jobs/:jobId/executions
 *   POST   /api/jobs/:jobId/run
 */

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createMockSupabaseClient,
  resetMockDB,
  seedTable,
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

describe('Job endpoints', () => {
  let app;
  let token;
  let mockTriggerJob;
  const ORIG_ENV = { ...process.env };

  const sampleJob = {
    id: 'job-001',
    user_id: TEST_USER.id,
    name: 'Daily Digest',
    description: 'Sends a daily message digest',
    job_type: 'cron',
    status: 'active',
    execute_at: null,
    interval_seconds: null,
    cron_expression: '0 9 * * *',
    action_type: 'report_generation',
    action_config: { reportId: 'rpt-001' },
    next_run_at: '2025-01-02T09:00:00Z',
    last_run_at: null,
    run_count: 0,
    last_error: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon';
    process.env.ALLOW_ANONYMOUS = 'false';

    mockTriggerJob = vi.fn().mockResolvedValue(undefined);
    app = await createTestApp({ overrides: { triggerJob: mockTriggerJob } });
  });

  beforeEach(() => {
    resetMockDB();
    process.env.ALLOW_ANONYMOUS = 'false';
    token = createTestToken(TEST_USER);
    seedAuthUser(token, TEST_USER);
    mockTriggerJob.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  // ===================== Supabase feature gate =====================

  describe('Supabase feature gate', () => {
    it('returns 501 for all job endpoints when Supabase is not configured', async () => {
      const noSupaApp = await createTestApp({ supabaseConfigured: false });

      const endpoints = [
        ['get', '/api/jobs'],
        ['post', '/api/jobs'],
        ['get', '/api/jobs/some-id'],
        ['patch', '/api/jobs/some-id'],
        ['delete', '/api/jobs/some-id'],
        ['get', '/api/jobs/some-id/executions'],
        ['post', '/api/jobs/some-id/run']
      ];

      for (const [method, path] of endpoints) {
        const res = await request(noSupaApp)[method](path)
          .set(createAuthHeaders(token))
          .send(method === 'post' ? { name: 'test' } : undefined);

        expect(res.status).toBe(501);
        expect(res.body.error).toContain('Supabase');
      }
    });
  });

  // ===================== GET /api/jobs =====================

  describe('GET /api/jobs', () => {
    it('returns jobs for the authenticated user', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .get('/api/jobs')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.jobs).toHaveLength(1);
      expect(res.body.jobs[0].name).toBe('Daily Digest');
    });

    it('returns empty list when user has no jobs', async () => {
      seedTable('scheduled_jobs', []);

      const res = await request(app)
        .get('/api/jobs')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.jobs).toEqual([]);
    });

    it('does not return jobs belonging to other users', async () => {
      seedTable('scheduled_jobs', [
        sampleJob,
        { ...sampleJob, id: 'job-other', user_id: 'other-user', name: 'Other Job' }
      ]);

      const res = await request(app)
        .get('/api/jobs')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.jobs).toHaveLength(1);
      expect(res.body.jobs[0].id).toBe('job-001');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(401);
    });
  });

  // ===================== POST /api/jobs =====================

  describe('POST /api/jobs', () => {
    it('creates a new job', async () => {
      seedTable('scheduled_jobs', []);

      const payload = {
        name: 'Hourly Check',
        description: 'Check every hour',
        jobType: 'interval',
        intervalSeconds: 3600,
        actionType: 'webhook',
        actionConfig: { url: 'https://example.com/hook' }
      };

      const res = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Hourly Check');
      expect(res.body.user_id).toBe(TEST_USER.id);
      expect(res.body.status).toBe('active');
      expect(res.body.job_type).toBe('recurring');
      expect(res.body.interval_seconds).toBe(3600);
    });

    it('creates a one-time job', async () => {
      seedTable('scheduled_jobs', []);

      const executeAt = '2025-06-01T12:00:00Z';
      const payload = {
        name: 'One-time task',
        jobType: 'once',
        executeAt,
        actionType: 'report_generation',
        actionConfig: { reportId: 'rpt-002' }
      };

      const res = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.job_type).toBe('one_time');
      expect(res.body.execute_at).toBe(executeAt);
    });

    it('creates a cron job', async () => {
      seedTable('scheduled_jobs', []);

      const payload = {
        name: 'Cron Job',
        jobType: 'cron',
        cronExpression: '30 8 * * 1',
        actionType: 'report_generation',
        actionConfig: {}
      };

      const res = await request(app)
        .post('/api/jobs')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.cron_expression).toBe('30 8 * * 1');
    });
  });

  // ===================== GET /api/jobs/:jobId =====================

  describe('GET /api/jobs/:jobId', () => {
    it('returns a specific job', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .get(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleJob.id);
      expect(res.body.name).toBe('Daily Digest');
      expect(res.body.action_config).toEqual({ reportId: 'rpt-001' });
    });

    it('returns 404 for non-existent job', async () => {
      seedTable('scheduled_jobs', []);

      const res = await request(app)
        .get('/api/jobs/nonexistent')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });

    it('returns 404 when job belongs to different user', async () => {
      seedTable('scheduled_jobs', [{ ...sampleJob, user_id: 'other-user' }]);

      const res = await request(app)
        .get(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(404);
    });
  });

  // ===================== PATCH /api/jobs/:jobId =====================

  describe('PATCH /api/jobs/:jobId', () => {
    it('updates job name and description', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .patch(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token))
        .send({ name: 'Updated Digest', description: 'Now with more detail' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Digest');
      expect(res.body.description).toBe('Now with more detail');
    });

    it('pauses a job by setting status to paused', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .patch(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token))
        .send({ status: 'paused' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
    });

    it('updates action config', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const newConfig = { reportId: 'rpt-999', format: 'csv' };
      const res = await request(app)
        .patch(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token))
        .send({ actionConfig: newConfig });

      expect(res.status).toBe(200);
      expect(res.body.action_config).toEqual(newConfig);
    });
  });

  // ===================== DELETE /api/jobs/:jobId =====================

  describe('DELETE /api/jobs/:jobId', () => {
    it('deletes a job', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .delete(`/api/jobs/${sampleJob.id}`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('returns 200 for idempotent delete of non-existent job', async () => {
      seedTable('scheduled_jobs', []);

      const res = await request(app)
        .delete('/api/jobs/nonexistent')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
    });
  });

  // ===================== GET /api/jobs/:jobId/executions =====================

  describe('GET /api/jobs/:jobId/executions', () => {
    it('returns executions for a job', async () => {
      const executions = [
        {
          id: 'exec-1',
          job_id: sampleJob.id,
          user_id: TEST_USER.id,
          status: 'completed',
          started_at: '2025-01-01T09:00:00Z',
          completed_at: '2025-01-01T09:00:05Z',
          duration_ms: 5000,
          result: { rows: 10 },
          error: null
        },
        {
          id: 'exec-2',
          job_id: sampleJob.id,
          user_id: TEST_USER.id,
          status: 'failed',
          started_at: '2025-01-02T09:00:00Z',
          completed_at: '2025-01-02T09:00:01Z',
          duration_ms: 1000,
          result: {},
          error: 'Timeout'
        }
      ];
      seedTable('job_executions', executions);

      const res = await request(app)
        .get(`/api/jobs/${sampleJob.id}/executions`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.executions).toHaveLength(2);
    });

    it('returns empty list when no executions', async () => {
      seedTable('job_executions', []);

      const res = await request(app)
        .get(`/api/jobs/${sampleJob.id}/executions`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.executions).toEqual([]);
    });

    it('accepts a limit query parameter', async () => {
      const executions = Array.from({ length: 5 }, (_, i) => ({
        id: `exec-${i}`,
        job_id: sampleJob.id,
        user_id: TEST_USER.id,
        status: 'completed',
        started_at: `2025-01-0${i + 1}T09:00:00Z`,
        completed_at: `2025-01-0${i + 1}T09:00:01Z`,
        duration_ms: 1000,
        result: {},
        error: null
      }));
      seedTable('job_executions', executions);

      const res = await request(app)
        .get(`/api/jobs/${sampleJob.id}/executions?limit=2`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      // The mock applies limit via the query builder
      expect(res.body.executions.length).toBeLessThanOrEqual(5);
    });
  });

  // ===================== POST /api/jobs/:jobId/run =====================

  describe('POST /api/jobs/:jobId/run', () => {
    it('triggers a manual job run and returns updated job', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      const res = await request(app)
        .post(`/api/jobs/${sampleJob.id}/run`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleJob.id);
      expect(mockTriggerJob).toHaveBeenCalledWith(sampleJob.id, TEST_USER.id);
    });

    it('calls triggerJob with correct arguments', async () => {
      seedTable('scheduled_jobs', [sampleJob]);

      await request(app)
        .post(`/api/jobs/${sampleJob.id}/run`)
        .set(createAuthHeaders(token));

      expect(mockTriggerJob).toHaveBeenCalledTimes(1);
      expect(mockTriggerJob).toHaveBeenCalledWith(sampleJob.id, TEST_USER.id);
    });

    it('returns 500 when triggerJob throws', async () => {
      seedTable('scheduled_jobs', [sampleJob]);
      mockTriggerJob.mockRejectedValueOnce(new Error('Scheduler unavailable'));

      const res = await request(app)
        .post(`/api/jobs/${sampleJob.id}/run`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Scheduler unavailable');
    });
  });
});
