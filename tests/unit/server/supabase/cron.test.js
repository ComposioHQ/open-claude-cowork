import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetMockDB, seedRpc, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

// Mock the embeddings module to avoid real OpenAI calls
vi.mock('../../../../server/supabase/embeddings.js', () => ({
  processUnembeddedMessages: vi.fn(() => Promise.resolve())
}));

import { setupCronJobs, startEmbeddingCron, stopEmbeddingCron } from '../../../../server/supabase/cron.js';
import { processUnembeddedMessages } from '../../../../server/supabase/embeddings.js';

describe('cron.js', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    resetMockDB();
    vi.useFakeTimers();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    stopEmbeddingCron();
    vi.useRealTimers();
    process.env = { ...ORIG_ENV };
  });

  describe('setupCronJobs', () => {
    it('completes without throwing even when pg_cron is not available', async () => {
      // The mock rpc returns success by default, but pg_cron RPCs have .catch() handlers
      // This test verifies the function itself does not throw
      await expect(setupCronJobs()).resolves.toBeUndefined();
    });

    it('handles errors from rpc gracefully', async () => {
      // Seed an rpc that throws
      seedRpc('query', () => { throw new Error('pg_cron not installed'); });

      // The function should catch the error internally and not throw
      await expect(setupCronJobs()).resolves.toBeUndefined();
    });
  });

  describe('startEmbeddingCron', () => {
    it('skips starting when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;

      startEmbeddingCron();

      expect(processUnembeddedMessages).not.toHaveBeenCalled();
    });

    it('runs processUnembeddedMessages immediately on start', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      startEmbeddingCron();

      expect(processUnembeddedMessages).toHaveBeenCalledTimes(1);
    });

    it('runs processUnembeddedMessages every 5 minutes', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      startEmbeddingCron();

      // Clear the initial call count
      expect(processUnembeddedMessages).toHaveBeenCalledTimes(1);

      // Advance by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(processUnembeddedMessages).toHaveBeenCalledTimes(2);

      // Advance by another 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(processUnembeddedMessages).toHaveBeenCalledTimes(3);
    });

    it('does not run on interval before 5 minutes', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      startEmbeddingCron();

      // Just under 5 minutes
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
      // Should still be just the initial call
      expect(processUnembeddedMessages).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopEmbeddingCron', () => {
    it('clears the interval', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      startEmbeddingCron();

      expect(processUnembeddedMessages).toHaveBeenCalledTimes(1);

      stopEmbeddingCron();

      // Advance timers — no more calls should happen
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(processUnembeddedMessages).toHaveBeenCalledTimes(1);
    });

    it('is safe to call when no cron is running', () => {
      expect(() => stopEmbeddingCron()).not.toThrow();
    });

    it('is safe to call multiple times', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      startEmbeddingCron();
      stopEmbeddingCron();
      stopEmbeddingCron(); // second call should be harmless

      expect(() => stopEmbeddingCron()).not.toThrow();
    });
  });
});
