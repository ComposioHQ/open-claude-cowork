import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock external dependencies ----

const mockGetActiveJobs = vi.fn();
const mockGetDueJobs = vi.fn();
const mockClaimDueJob = vi.fn();
const mockGetJob = vi.fn();
const mockUpdateJob = vi.fn();
const mockAddJobExecution = vi.fn();
const mockUpdateJobExecution = vi.fn();
const mockRecoverStaleRunningJobs = vi.fn();

vi.mock('../../../server/supabase/job-store.js', () => ({
  getActiveJobs: mockGetActiveJobs,
  getDueJobs: mockGetDueJobs,
  claimDueJob: mockClaimDueJob,
  recoverStaleRunningJobs: mockRecoverStaleRunningJobs,
  getJob: mockGetJob,
  updateJob: mockUpdateJob,
  addJobExecution: mockAddJobExecution,
  updateJobExecution: mockUpdateJobExecution,
  createJob: vi.fn(),
  getUserJobs: vi.fn(),
  deleteJob: vi.fn(),
  getJobExecutions: vi.fn(),
}));

const mockGetSavedReport = vi.fn();
const mockExecuteCustomQuery = vi.fn();
const mockUpdateReportResult = vi.fn();
const mockGetDailyMessages = vi.fn();
const mockGetProviderUsage = vi.fn();

const mockProviderQuery = vi.fn(async function* () {
  // default: no output chunks
});

mockProviderQuery.mockName('provider.query');

const mockGetProvider = vi.fn(() => ({ query: mockProviderQuery }));

vi.mock('../../../server/supabase/report-store.js', () => ({
  getSavedReport: mockGetSavedReport,
  executeCustomQuery: mockExecuteCustomQuery,
  updateReportResult: mockUpdateReportResult,
  getDailyMessages: mockGetDailyMessages,
  getProviderUsage: mockGetProviderUsage,
  getToolUsage: vi.fn(),
  getSummary: vi.fn(),
  getSavedReports: vi.fn(),
  createSavedReport: vi.fn(),
  updateSavedReport: vi.fn(),
  deleteSavedReport: vi.fn(),
}));

vi.mock('../../../server/providers/index.js', () => ({
  getProvider: mockGetProvider
}));

// Import module under test AFTER mocks are set up
const { startScheduler, stopScheduler, triggerJob, getNextCronRun } = await import(
  '../../../server/job-scheduler.js'
);

describe('job-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockProviderQuery.mockImplementation(async function* () {
      // default: no output chunks
    });
    mockGetProvider.mockReturnValue({ query: mockProviderQuery });
    // Silence console.log / console.error in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Always stop the scheduler to clear any intervals so they don't leak
    stopScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getNextCronRun', () => {
    it('supports "?" as a wildcard in day and weekday fields', () => {
      vi.setSystemTime(new Date(2026, 0, 15, 10, 5, 0, 0));

      const next = getNextCronRun('30 11 ? * ?');

      expect(next).toBeInstanceOf(Date);
      expect(next.getMonth()).toBe(0);
      expect(next.getDate()).toBe(15);
      expect(next.getHours()).toBe(11);
      expect(next.getMinutes()).toBe(30);
    });

    it('supports "L" for last day-of-month', () => {
      vi.setSystemTime(new Date(2026, 0, 20, 8, 0, 0, 0));

      const next = getNextCronRun('0 9 L * *');

      expect(next).toBeInstanceOf(Date);
      expect(next.getMonth()).toBe(0); // January
      expect(next.getDate()).toBe(31);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('supports "L-n" for offsets from the last day', () => {
      vi.setSystemTime(new Date(2026, 0, 20, 8, 0, 0, 0));

      const next = getNextCronRun('0 9 L-3 * *');

      expect(next).toBeInstanceOf(Date);
      expect(next.getMonth()).toBe(0);
      expect(next.getDate()).toBe(28);
    });

    it('supports "W" nearest weekday for day-of-month expressions', () => {
      vi.setSystemTime(new Date(2026, 0, 10, 8, 0, 0, 0));

      const next = getNextCronRun('0 9 1W * *');

      expect(next).toBeInstanceOf(Date);
      expect(next.getFullYear()).toBe(2026);
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDate()).toBe(2);
    });

    it('supports "#" for nth weekday-of-month in day-of-week field', () => {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 0));

      const next = getNextCronRun('0 9 * * fri#3');

      expect(next).toBeInstanceOf(Date);
      expect(next.getDate()).toBe(16);
      expect(next.getDay()).toBe(5);
    });

    it('supports "nL" for last weekday in month', () => {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 0));

      const next = getNextCronRun('0 9 * * friL');

      expect(next).toBeInstanceOf(Date);
      expect(next.getMonth()).toBe(0);
      expect(next.getDate()).toBe(30);
      expect(next.getDay()).toBe(5);
    });

    it('returns null for invalid cron expressions', () => {
      expect(getNextCronRun('not a cron')).toBeNull();
      expect(getNextCronRun('*/5 * * * * *')).toBeNull();
      expect(getNextCronRun('0 0 32 * *')).toBeNull();
    });
  });

  // ======================================================================
  // startScheduler
  // ======================================================================
  describe('startScheduler', () => {
    it('loads active jobs on startup', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();

      expect(mockGetActiveJobs).toHaveBeenCalledOnce();
    });

    it('sets next_run_at for active jobs that have none', async () => {
      const recurringJob = {
        id: 'job-1',
        user_id: 'u1',
        job_type: 'recurring',
        interval_seconds: 300,
        next_run_at: null,
      };

      mockGetActiveJobs.mockResolvedValue([recurringJob]);
      mockGetDueJobs.mockResolvedValue([]);
      mockUpdateJob.mockResolvedValue({});

      await startScheduler();

      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-1',
        'u1',
        expect.objectContaining({ nextRunAt: expect.any(String) })
      );
    });

    it('does not update next_run_at for jobs that already have one', async () => {
      const jobWithNextRun = {
        id: 'job-2',
        user_id: 'u1',
        job_type: 'recurring',
        interval_seconds: 600,
        next_run_at: '2099-01-01T00:00:00.000Z',
      };

      mockGetActiveJobs.mockResolvedValue([jobWithNextRun]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();

      expect(mockUpdateJob).not.toHaveBeenCalled();
    });

    it('handles errors loading active jobs gracefully', async () => {
      mockGetActiveJobs.mockRejectedValue(new Error('DB down'));
      mockGetDueJobs.mockResolvedValue([]);

      // Should not throw
      await expect(startScheduler()).resolves.toBeUndefined();
    });

    it('runs an initial poll immediately', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // getDueJobs is called by the initial pollAndExecute
      expect(mockGetDueJobs).toHaveBeenCalledOnce();
    });

    it('sets up a poll interval that fires every 60 seconds', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();
      await vi.advanceTimersByTimeAsync(0);

      // Clear the initial call count
      mockGetDueJobs.mockClear();

      // Advance by 60 seconds
      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockGetDueJobs).toHaveBeenCalledOnce();
    });

    it('calculates nextRunAt for one_time job using execute_at', async () => {
      const oneTimeJob = {
        id: 'job-ot',
        user_id: 'u1',
        job_type: 'one_time',
        execute_at: '2099-06-15T10:00:00.000Z',
        next_run_at: null,
      };

      mockGetActiveJobs.mockResolvedValue([oneTimeJob]);
      mockGetDueJobs.mockResolvedValue([]);
      mockUpdateJob.mockResolvedValue({});

      await startScheduler();

      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-ot',
        'u1',
        expect.objectContaining({ nextRunAt: '2099-06-15T10:00:00.000Z' })
      );
      expect(mockUpdateJob.mock.calls[0][2]).toEqual(expect.objectContaining({ status: 'active' }));
    });

    it('calculates nextRunAt for cron job with valid expression', async () => {
      const cronJob = {
        id: 'job-cr',
        user_id: 'u1',
        job_type: 'cron',
        cron_expression: '30 * * * *',
        next_run_at: null,
      };

      mockGetActiveJobs.mockResolvedValue([cronJob]);
      mockGetDueJobs.mockResolvedValue([]);
      mockUpdateJob.mockResolvedValue({});

      await startScheduler();

      // Should have called updateJob with a valid ISO date string
      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-cr',
        'u1',
        expect.objectContaining({ nextRunAt: expect.any(String) })
      );
      expect(mockUpdateJob.mock.calls[0][2]).toEqual(expect.objectContaining({ status: 'active' }));
      const nextRunAt = new Date(mockUpdateJob.mock.calls[0][2].nextRunAt);
      expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
      expect(nextRunAt.getMinutes()).toBe(30);
    });

    it('does not set nextRunAt for cron with invalid expression', async () => {
      const badCronJob = {
        id: 'job-bad',
        user_id: 'u1',
        job_type: 'cron',
        cron_expression: 'not a cron',
        next_run_at: null,
      };

      mockGetActiveJobs.mockResolvedValue([badCronJob]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();

      // getNextCronRun returns null for invalid expression, so updateJob is not called
      expect(mockUpdateJob).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // stopScheduler
  // ======================================================================
  describe('stopScheduler', () => {
    it('clears the poll interval', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();
      await vi.advanceTimersByTimeAsync(0);
      stopScheduler();

      mockGetDueJobs.mockClear();

      // Advance time — poll should NOT fire
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockGetDueJobs).not.toHaveBeenCalled();
    });

    it('is safe to call even when scheduler was never started', () => {
      expect(() => stopScheduler()).not.toThrow();
    });

    it('can be called multiple times without error', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValue([]);

      await startScheduler();
      stopScheduler();
      expect(() => stopScheduler()).not.toThrow();
    });
  });

  // ======================================================================
  // triggerJob
  // ======================================================================
  describe('triggerJob', () => {
    it('fetches the job and executes it', async () => {
      const job = {
        id: 'job-t1',
        user_id: 'u1',
        name: 'Test trigger',
        action_type: 'chat_message',
        action_config: { prompt: 'hello' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-1' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      const result = await triggerJob('job-t1', 'u1');

      expect(mockGetJob).toHaveBeenCalledWith('job-t1', 'u1');
      expect(result).toEqual(job);
    });

    it('throws when job is not found', async () => {
      mockGetJob.mockResolvedValue(null);

      await expect(triggerJob('no-such-job', 'u1')).rejects.toThrow(
        'Job not found'
      );
    });

    it('executes a report_generation action', async () => {
      const reportId = 'rpt-42';
      const job = {
        id: 'job-rpt',
        user_id: 'u1',
        name: 'Generate report',
        action_type: 'report_generation',
        action_config: { reportId },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-2' });
      mockGetSavedReport.mockResolvedValue({
        id: reportId,
        report_config: { query: 'SELECT 1' },
      });
      mockExecuteCustomQuery.mockResolvedValue([{ count: 42 }]);
      mockUpdateReportResult.mockResolvedValue({});
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-rpt', 'u1');

      expect(mockGetSavedReport).toHaveBeenCalledWith(reportId, 'u1');
      expect(mockExecuteCustomQuery).toHaveBeenCalledWith('u1', {
        query: 'SELECT 1',
      });
      expect(mockUpdateReportResult).toHaveBeenCalledWith('rpt-42', 'u1', [
        { count: 42 },
      ]);
      // Execution marked success
      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-2',
        expect.objectContaining({
          status: 'success',
          result: { reportId, rowCount: 1 },
        })
      );
    });

    it('executes a report_generation action and fails when report not found', async () => {
      const job = {
        id: 'job-rpt2',
        user_id: 'u1',
        name: 'Bad report',
        action_type: 'report_generation',
        action_config: { reportId: 'nonexistent' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-3' });
      mockGetSavedReport.mockResolvedValue(null);
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      // triggerJob does not re-throw — executeJob catches errors internally
      await triggerJob('job-rpt2', 'u1');

      // Execution marked as failed
      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-3',
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Report not found'),
        })
      );
    });

    it('executes a webhook action', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockResolvedValue('ok'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const job = {
        id: 'job-wh',
        user_id: 'u1',
        name: 'Webhook ping',
        action_type: 'webhook',
        action_config: {
          url: 'https://example.com/hook',
          method: 'POST',
          body: { event: 'test' },
        },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-wh' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-wh', 'u1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event: 'test' }),
          signal: expect.any(AbortSignal),
        }
      );
      expect(mockFetch.mock.calls[0][0].toString()).toBe('https://example.com/hook');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-wh',
        expect.objectContaining({
          status: 'success',
          result: { status: 200, statusText: 'OK', body: 'ok' },
        })
      );

      vi.unstubAllGlobals();
    });

    it('executes a webhook action and records failure on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('temporarily unavailable'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const job = {
        id: 'job-wh2',
        user_id: 'u1',
        name: 'Bad webhook',
        action_type: 'webhook',
        action_config: { url: 'https://example.com/fail' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-wh2' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-wh2', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-wh2',
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('500'),
        })
      );

      vi.unstubAllGlobals();
    });

    it('executes a webhook action and fails when URL is missing', async () => {
      const job = {
        id: 'job-wh3',
        user_id: 'u1',
        name: 'No-url webhook',
        action_type: 'webhook',
        action_config: {},
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-wh3' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-wh3', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-wh3',
        expect.objectContaining({
          status: 'failed',
          error: 'Webhook URL is required',
        })
      );
    });

    it('handles unknown action_type as an error', async () => {
      const job = {
        id: 'job-unk',
        user_id: 'u1',
        name: 'Unknown action',
        action_type: 'foobar',
        action_config: {},
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-unk' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-unk', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-unk',
        expect.objectContaining({
          status: 'failed',
          error: 'Unknown action type: foobar',
        })
      );
    });

    it('executes a data_export action for messages', async () => {
      const job = {
        id: 'job-de',
        user_id: 'u1',
        name: 'Export msgs',
        action_type: 'data_export',
        action_config: { source: 'messages', format: 'csv' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-de' });
      mockGetDailyMessages.mockResolvedValue([{ day: '2025-01-01', count: 5 }]);
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-de', 'u1');

      expect(mockGetDailyMessages).toHaveBeenCalledWith('u1', 365);
      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-de',
        expect.objectContaining({
          status: 'success',
          result: {
            format: 'csv',
            rowCount: 1,
            source: 'messages',
            data: 'day,count\n2025-01-01,5',
            contentType: 'text/csv',
          },
        })
      );
    });

    it('executes a data_export action with legacy chats source as messages', async () => {
      const job = {
        id: 'job-de3',
        user_id: 'u1',
        name: 'Export chats',
        action_type: 'data_export',
        action_config: { source: 'chats', format: 'json' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-de3' });
      mockGetDailyMessages.mockResolvedValue([{ day: '2025-01-01', count: 5 }]);
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-de3', 'u1');

      expect(mockGetDailyMessages).toHaveBeenCalledWith('u1', 365);
      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-de3',
        expect.objectContaining({
          status: 'success',
          result: {
            format: 'json',
            rowCount: 1,
            source: 'messages',
            data: '[{"day":"2025-01-01","count":5}]',
            contentType: 'application/json',
          },
        })
      );
    });

    it('executes a data_export action for provider usage', async () => {
      const job = {
        id: 'job-de2',
        user_id: 'u1',
        name: 'Export providers',
        action_type: 'data_export',
        action_config: { source: 'providers' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-de2' });
      mockGetProviderUsage.mockResolvedValue([]);
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-de2', 'u1');

      expect(mockGetProviderUsage).toHaveBeenCalledWith('u1', 365);
    });

    it('fails a data_export action with unsupported source', async () => {
      const job = {
        id: 'job-de-fail',
        user_id: 'u1',
        name: 'Export unsupported',
        action_type: 'data_export',
        action_config: { source: 'unknown_source', format: 'json' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-de-fail' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-de-fail', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-de-fail',
        expect.objectContaining({
          status: 'failed',
          error: 'Unsupported data_export source: unknown_source',
        })
      );
    });

    it('fails a data_export action with unsupported format', async () => {
      const job = {
        id: 'job-de-format',
        user_id: 'u1',
        name: 'Export bad format',
        action_type: 'data_export',
        action_config: { source: 'messages', format: 'xml' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-de-format' });
      mockGetDailyMessages.mockResolvedValue([{ day: '2025-01-01', count: 5 }]);
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-de-format', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-de-format',
        expect.objectContaining({
          status: 'failed',
          error: 'Unsupported data_export format: xml',
        })
      );
    });

    it('executes a chat_message action with provider output', async () => {
      const job = {
        id: 'job-cm',
        user_id: 'u1',
        name: 'Chat msg',
        action_type: 'chat_message',
        action_config: { prompt: 'Hello' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-cm' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});
      mockProviderQuery.mockImplementation(async function* () {
        yield { type: 'text', content: 'Hi ' };
        yield { type: 'text', content: 'there' };
      });
      mockGetProvider.mockReturnValue({ query: mockProviderQuery });

      await triggerJob('job-cm', 'u1');

      expect(mockUpdateJobExecution).toHaveBeenCalledWith(
        'exec-cm',
        expect.objectContaining({
          status: 'success',
          result: expect.objectContaining({
            provider: 'claude',
            response: 'Hi there',
            responseLength: 8,
          }),
        })
      );
      expect(mockGetProvider).toHaveBeenCalledWith('claude');
    });

    it('marks one_time job as completed after execution', async () => {
      const job = {
        id: 'job-ot',
        user_id: 'u1',
        name: 'Once',
        action_type: 'chat_message',
        action_config: { prompt: 'Hello once' },
        job_type: 'one_time',
        run_count: 0,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-ot' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-ot', 'u1');

      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-ot',
        'u1',
        expect.objectContaining({
          status: 'completed',
          nextRunAt: null,
          runCount: 1,
          lastError: null,
        })
      );
    });

    it('sets nextRunAt for recurring job after execution', async () => {
      const job = {
        id: 'job-rec',
        user_id: 'u1',
        name: 'Recurring',
        action_type: 'chat_message',
        action_config: { prompt: 'Hello recurring' },
        job_type: 'recurring',
        interval_seconds: 600,
        run_count: 3,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-rec' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-rec', 'u1');

      const updateCall = mockUpdateJob.mock.calls[0][2];
      expect(updateCall.runCount).toBe(4);
      expect(updateCall.lastError).toBeNull();

      // nextRunAt should be approximately now + 600s
      const nextRunAt = new Date(updateCall.nextRunAt);
      const expectedMin = Date.now() + 599_000;
      const expectedMax = Date.now() + 601_000;
      expect(nextRunAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(nextRunAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('increments run_count on failure', async () => {
      const job = {
        id: 'job-fail',
        user_id: 'u1',
        name: 'Fail job',
        action_type: 'foobar',
        action_config: {},
        job_type: 'one_time',
        run_count: 2,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-fail' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-fail', 'u1');

      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-fail',
        'u1',
        expect.objectContaining({
          runCount: 3,
          lastError: 'Unknown action type: foobar',
        })
      );
    });

    it('keeps one_time failed jobs completed without next run', async () => {
      const job = {
        id: 'job-fail-once',
        user_id: 'u1',
        name: 'Fail one-time',
        action_type: 'foobar',
        action_config: {},
        job_type: 'one_time',
        run_count: 5,
      };

      mockGetJob.mockResolvedValue(job);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-fail-once' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await triggerJob('job-fail-once', 'u1');

      expect(mockUpdateJob).toHaveBeenCalledWith(
        'job-fail-once',
        'u1',
        expect.objectContaining({
          status: 'completed',
          nextRunAt: null,
        })
      );
    });
  });

  // ======================================================================
  // pollAndExecute (tested indirectly via startScheduler + timer)
  // ======================================================================
  describe('pollAndExecute (indirect)', () => {
    it('executes due jobs returned by getDueJobs', async () => {
      const dueJob = {
        id: 'due-1',
        user_id: 'u1',
        name: 'Due job',
        action_type: 'chat_message',
        action_config: {},
        job_type: 'one_time',
        run_count: 0,
        next_run_at: new Date().toISOString()
      };

      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockResolvedValueOnce([dueJob]);
      mockClaimDueJob.mockResolvedValue(dueJob);
      mockAddJobExecution.mockResolvedValue({ id: 'exec-due' });
      mockUpdateJobExecution.mockResolvedValue({});
      mockUpdateJob.mockResolvedValue({});

      await startScheduler();

      // Wait for the executeJob promise to settle
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAddJobExecution).toHaveBeenCalledWith(
        'due-1',
        'u1',
        expect.objectContaining({ status: 'running' })
      );
    });

    it('handles poll errors gracefully without crashing', async () => {
      mockGetActiveJobs.mockResolvedValue([]);
      mockGetDueJobs.mockRejectedValue(new Error('DB timeout'));

      // Should not throw
      await expect(startScheduler()).resolves.toBeUndefined();
    });
  });
});
