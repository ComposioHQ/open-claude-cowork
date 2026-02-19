import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedTable, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import {
  createJob,
  getUserJobs,
  getJob,
  updateJob,
  deleteJob,
  getJobExecutions,
  addJobExecution,
  updateJobExecution,
  getDueJobs,
  getActiveJobs,
  claimDueJob,
  recoverStaleRunningJobs
} from '../../../../server/supabase/job-store.js';

describe('job-store.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  // ==================== JOBS CRUD ====================

  describe('createJob', () => {
    it('inserts a new scheduled job', async () => {
      seedTable('scheduled_jobs', []);

      const result = await createJob('user-1', {
        name: 'Daily Report',
        description: 'Generate daily report',
        jobType: 'recurring',
        actionType: 'api_call',
        actionConfig: { url: 'https://example.com/report' },
        executeAt: '2025-02-01T08:00:00Z',
        intervalSeconds: 86400,
        cronExpression: '0 8 * * *'
      });

      expect(result).toBeDefined();
      expect(result.user_id).toBe('user-1');
      expect(result.name).toBe('Daily Report');
      expect(result.status).toBe('active');
      expect(result.job_type).toBe('recurring');
      expect(result.action_type).toBe('api_call');
      expect(result.interval_seconds).toBe(86400);
      expect(result.cron_expression).toBe('0 8 * * *');
    });

    it('accepts snake_case payload fields and legacy action/job aliases', async () => {
      seedTable('scheduled_jobs', []);

      const result = await createJob('user-1', {
        name: 'Legacy Job',
        description: 'Supports legacy payloads',
        job_type: 'interval',
        action_type: 'report',
        action_config: { reportId: 'rpt-123' },
        interval_seconds: 3600,
        execute_at: '2025-02-01T08:00:00Z',
      });

      expect(result.job_type).toBe('recurring');
      expect(result.action_type).toBe('report_generation');
      expect(result.interval_seconds).toBe(3600);
    });

    it('defaults optional fields to null/empty', async () => {
      seedTable('scheduled_jobs', []);

      const result = await createJob('user-1', {
        name: 'Simple Job',
        jobType: 'one_time',
        actionType: 'notification'
      });

      expect(result.description).toBe('');
      expect(result.execute_at).toBeNull();
      expect(result.interval_seconds).toBeNull();
      expect(result.cron_expression).toBeNull();
      expect(result.action_config).toEqual({});
    });
  });

  describe('getUserJobs', () => {
    it('returns all jobs for the user sorted by created_at desc', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Job 1', status: 'active', created_at: '2025-01-01T00:00:00Z' },
        { id: 'j-2', user_id: 'user-1', name: 'Job 2', status: 'paused', created_at: '2025-01-02T00:00:00Z' },
        { id: 'j-3', user_id: 'user-2', name: 'Other User', status: 'active', created_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getUserJobs('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Job 2');
      expect(result[1].name).toBe('Job 1');
    });

    it('filters by status when provided', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Active Job', status: 'active', created_at: '2025-01-01T00:00:00Z' },
        { id: 'j-2', user_id: 'user-1', name: 'Paused Job', status: 'paused', created_at: '2025-01-02T00:00:00Z' }
      ]);

      const result = await getUserJobs('user-1', { status: 'active' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active Job');
    });

    it('applies limit when provided', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Job 1', status: 'active', created_at: '2025-01-01T00:00:00Z' },
        { id: 'j-2', user_id: 'user-1', name: 'Job 2', status: 'active', created_at: '2025-01-02T00:00:00Z' },
        { id: 'j-3', user_id: 'user-1', name: 'Job 3', status: 'active', created_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getUserJobs('user-1', { limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('returns empty array when user has no jobs', async () => {
      seedTable('scheduled_jobs', []);

      const result = await getUserJobs('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getJob', () => {
    it('returns a specific job by id and userId', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'My Job', status: 'active' }
      ]);

      const result = await getJob('j-1', 'user-1');

      expect(result.id).toBe('j-1');
      expect(result.name).toBe('My Job');
    });

    it('throws when job is not found', async () => {
      seedTable('scheduled_jobs', []);

      await expect(getJob('nonexistent', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });

    it('does not return jobs belonging to other users', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-2', name: 'Other User Job', status: 'active' }
      ]);

      await expect(getJob('j-1', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });
  });

  describe('updateJob', () => {
    it('updates job fields', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Old Name', status: 'active', description: 'Desc' }
      ]);

      const result = await updateJob('j-1', 'user-1', {
        name: 'New Name',
        status: 'paused'
      });

      expect(result.name).toBe('New Name');
      expect(result.status).toBe('paused');
      expect(result.description).toBe('Desc'); // unchanged
    });

    it('updates scheduling fields', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Job', status: 'active', interval_seconds: 3600 }
      ]);

      const result = await updateJob('j-1', 'user-1', {
        intervalSeconds: 7200,
        nextRunAt: '2025-02-01T12:00:00Z',
        lastRunAt: '2025-02-01T06:00:00Z',
        runCount: 5
      });

      expect(result.interval_seconds).toBe(7200);
      expect(result.next_run_at).toBe('2025-02-01T12:00:00Z');
      expect(result.last_run_at).toBe('2025-02-01T06:00:00Z');
      expect(result.run_count).toBe(5);
    });

    it('accepts snake_case and legacy aliases on update', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-2', user_id: 'user-1', name: 'Legacy Update', status: 'active' }
      ]);

      const result = await updateJob('j-2', 'user-1', {
        job_type: 'once',
        action_type: 'report',
      });

      expect(result.job_type).toBe('one_time');
      expect(result.action_type).toBe('report_generation');
    });

    it('updates lastError field', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Job', status: 'active', last_error: null }
      ]);

      const result = await updateJob('j-1', 'user-1', {
        lastError: 'Connection timeout'
      });

      expect(result.last_error).toBe('Connection timeout');
    });
  });

  describe('deleteJob', () => {
    it('removes the job', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'To Delete' },
        { id: 'j-2', user_id: 'user-1', name: 'Keep' }
      ]);

      await deleteJob('j-1', 'user-1');

      const remaining = await getUserJobs('user-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('j-2');
    });
  });

  // ==================== JOB EXECUTIONS ====================

  describe('getJobExecutions', () => {
    it('returns executions for a job sorted by started_at desc', async () => {
      seedTable('job_executions', [
        { id: 'e-1', job_id: 'j-1', user_id: 'user-1', status: 'success', started_at: '2025-01-01T00:00:00Z' },
        { id: 'e-2', job_id: 'j-1', user_id: 'user-1', status: 'failed', started_at: '2025-01-02T00:00:00Z' },
        { id: 'e-3', job_id: 'j-2', user_id: 'user-1', status: 'success', started_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getJobExecutions('j-1', 'user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('e-2');
      expect(result[1].id).toBe('e-1');
    });

    it('applies limit when provided', async () => {
      seedTable('job_executions', [
        { id: 'e-1', job_id: 'j-1', user_id: 'user-1', status: 'success', started_at: '2025-01-01T00:00:00Z' },
        { id: 'e-2', job_id: 'j-1', user_id: 'user-1', status: 'success', started_at: '2025-01-02T00:00:00Z' },
        { id: 'e-3', job_id: 'j-1', user_id: 'user-1', status: 'success', started_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getJobExecutions('j-1', 'user-1', { limit: 1 });

      expect(result).toHaveLength(1);
    });

    it('returns empty array when no executions exist', async () => {
      seedTable('job_executions', []);

      const result = await getJobExecutions('j-1', 'user-1');

      expect(result).toEqual([]);
    });
  });

  describe('addJobExecution', () => {
    it('inserts a new job execution record', async () => {
      seedTable('job_executions', []);

      const result = await addJobExecution('j-1', 'user-1', {
        status: 'success',
        startedAt: '2025-01-15T10:00:00Z',
        completedAt: '2025-01-15T10:00:05Z',
        durationMs: 5000,
        result: { output: 'done' }
      });

      expect(result.job_id).toBe('j-1');
      expect(result.user_id).toBe('user-1');
      expect(result.status).toBe('success');
      expect(result.duration_ms).toBe(5000);
      expect(result.result).toEqual({ output: 'done' });
    });

    it('defaults optional fields', async () => {
      seedTable('job_executions', []);

      const result = await addJobExecution('j-1', 'user-1', {});

      expect(result.status).toBe('running');
      expect(result.completed_at).toBeNull();
      expect(result.duration_ms).toBeNull();
      expect(result.result).toEqual({});
      expect(result.error).toBeNull();
    });

    it('stores error field when provided', async () => {
      seedTable('job_executions', []);

      const result = await addJobExecution('j-1', 'user-1', {
        status: 'failed',
        error: 'Timeout after 30s'
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Timeout after 30s');
    });
  });

  describe('updateJobExecution', () => {
    it('updates execution status and completion fields', async () => {
      seedTable('job_executions', [
        {
          id: 'e-1', job_id: 'j-1', user_id: 'user-1',
          status: 'running', started_at: '2025-01-15T10:00:00Z',
          completed_at: null, duration_ms: null, result: {}, error: null
        }
      ]);

      const result = await updateJobExecution('e-1', {
        status: 'success',
        completedAt: '2025-01-15T10:00:10Z',
        durationMs: 10000,
        result: { rows: 42 }
      });

      expect(result.status).toBe('success');
      expect(result.completed_at).toBe('2025-01-15T10:00:10Z');
      expect(result.duration_ms).toBe(10000);
      expect(result.result).toEqual({ rows: 42 });
    });

    it('updates error field on failure', async () => {
      seedTable('job_executions', [
        { id: 'e-1', job_id: 'j-1', user_id: 'user-1', status: 'running', error: null }
      ]);

      const result = await updateJobExecution('e-1', {
        status: 'failed',
        error: 'API returned 500'
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('API returned 500');
    });
  });

  // ==================== SCHEDULER HELPERS ====================

  describe('getDueJobs', () => {
    it('returns active jobs where next_run_at is in the past', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const futureDate = new Date(Date.now() + 60000).toISOString();

      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Due Job', status: 'active', next_run_at: pastDate },
        { id: 'j-2', user_id: 'user-1', name: 'Not Due', status: 'active', next_run_at: futureDate },
        { id: 'j-3', user_id: 'user-1', name: 'Paused Job', status: 'paused', next_run_at: pastDate }
      ]);

      const result = await getDueJobs();

      // Should only return active jobs with past next_run_at
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Due Job');
    });

    it('returns empty array when no jobs are due', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();

      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Future Job', status: 'active', next_run_at: futureDate }
      ]);

      const result = await getDueJobs();

      expect(result).toEqual([]);
    });

    it('sorts due jobs by next_run_at ascending', async () => {
      const earlyPast = new Date(Date.now() - 120000).toISOString();
      const latePast = new Date(Date.now() - 60000).toISOString();

      seedTable('scheduled_jobs', [
        { id: 'j-2', user_id: 'user-1', name: 'Later Due', status: 'active', next_run_at: latePast },
        { id: 'j-1', user_id: 'user-1', name: 'Earlier Due', status: 'active', next_run_at: earlyPast }
      ]);

      const result = await getDueJobs();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Earlier Due');
      expect(result[1].name).toBe('Later Due');
    });
  });

  describe('getActiveJobs', () => {
    it('returns all active jobs sorted by next_run_at ascending', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Active 1', status: 'active', next_run_at: '2025-01-02T00:00:00Z' },
        { id: 'j-2', user_id: 'user-1', name: 'Active 2', status: 'active', next_run_at: '2025-01-01T00:00:00Z' },
        { id: 'j-3', user_id: 'user-1', name: 'Paused', status: 'paused', next_run_at: '2025-01-01T00:00:00Z' }
      ]);

      const result = await getActiveJobs();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Active 2');
      expect(result[1].name).toBe('Active 1');
    });

    it('returns empty array when no active jobs exist', async () => {
      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Paused', status: 'paused', next_run_at: '2025-01-01T00:00:00Z' }
      ]);

      const result = await getActiveJobs();

      expect(result).toEqual([]);
    });
  });

  // ==================== SCHEDULER LEASE HELPERS ====================

  describe('claimDueJob', () => {
    it('claims a due job by setting a lease timestamp', async () => {
      seedTable('scheduled_jobs', [
        {
          id: 'j-1',
          user_id: 'user-1',
          name: 'Due job',
          status: 'active',
          next_run_at: '2025-01-01T00:00:00Z'
        }
      ]);

      const result = await claimDueJob('j-1', 'user-1', '2025-01-01T00:00:00Z', 120000);

      expect(result.id).toBe('j-1');
      expect(result.next_run_at).toBeDefined();
      expect(result.next_run_at).not.toBe('2025-01-01T00:00:00Z');
    });

    it('returns null if the job is already claimed', async () => {
      seedTable('scheduled_jobs', []);
      const result = await claimDueJob('j-1', 'user-1', '2025-01-01T00:00:00Z', 120000);
      expect(result).toBeNull();
    });
  });

  describe('recoverStaleRunningJobs', () => {
    it('re-calls stale claimed jobs into execution window', async () => {
      const now = new Date();
      const stale = new Date(now.getTime() - 120_000).toISOString();
      const fresh = new Date(now.getTime() + 60_000).toISOString();

      seedTable('scheduled_jobs', [
        { id: 'j-1', user_id: 'user-1', name: 'Stale', status: 'active', next_run_at: stale },
        { id: 'j-2', user_id: 'user-1', name: 'Fresh', status: 'active', next_run_at: fresh }
      ]);

      const result = await recoverStaleRunningJobs(120_000);

      expect(Array.isArray(result)).toBe(true);
      expect(result.some(r => r.id === 'j-1')).toBe(true);
      expect(result.some(r => r.id === 'j-2')).toBe(false);
    });
  });
});
