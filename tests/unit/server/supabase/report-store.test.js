import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedTable, seedRpc, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import {
  getDailyMessages,
  getProviderUsage,
  getToolUsage,
  getSummary,
  executeCustomQuery,
  getSavedReports,
  getSavedReport,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
  updateReportResult
} from '../../../../server/supabase/report-store.js';

describe('report-store.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  // ==================== RPC REPORT QUERIES ====================

  describe('getDailyMessages', () => {
    it('calls report_daily_messages RPC with userId and days', async () => {
      const mockData = [
        { day: '2025-01-01', count: 5 },
        { day: '2025-01-02', count: 10 }
      ];
      seedRpc('report_daily_messages', (params) => {
        expect(params.p_user_id).toBe('user-1');
        expect(params.p_days).toBe(30);
        return mockData;
      });

      const result = await getDailyMessages('user-1');

      expect(result).toEqual(mockData);
    });

    it('uses custom days parameter', async () => {
      seedRpc('report_daily_messages', (params) => {
        expect(params.p_days).toBe(7);
        return [];
      });

      const result = await getDailyMessages('user-1', 7);

      expect(result).toEqual([]);
    });

    it('returns empty array when RPC returns null', async () => {
      seedRpc('report_daily_messages', null);

      const result = await getDailyMessages('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getProviderUsage', () => {
    it('calls report_provider_usage RPC', async () => {
      const mockData = [
        { provider: 'claude', count: 50 },
        { provider: 'other-provider', count: 20 }
      ];
      seedRpc('report_provider_usage', mockData);

      const result = await getProviderUsage('user-1');

      expect(result).toEqual(mockData);
    });

    it('accepts custom days parameter', async () => {
      seedRpc('report_provider_usage', (params) => {
        expect(params.p_days).toBe(14);
        return [];
      });

      await getProviderUsage('user-1', 14);
    });
  });

  describe('getToolUsage', () => {
    it('calls report_tool_usage RPC', async () => {
      const mockData = [
        { tool: 'Read', count: 30 },
        { tool: 'Write', count: 15 }
      ];
      seedRpc('report_tool_usage', mockData);

      const result = await getToolUsage('user-1');

      expect(result).toEqual(mockData);
    });
  });

  describe('getSummary', () => {
    it('returns the first row of report_summary RPC', async () => {
      const summaryRow = { total_chats: 5, total_messages: 100, active_days: 10, avg_messages_per_day: 10 };
      seedRpc('report_summary', [summaryRow]);

      const result = await getSummary('user-1');

      expect(result).toEqual(summaryRow);
    });

    it('returns default summary when RPC returns null', async () => {
      seedRpc('report_summary', null);

      const result = await getSummary('user-1');

      expect(result).toEqual({ total_chats: 0, total_messages: 0, active_days: 0, avg_messages_per_day: 0 });
    });

    it('returns default summary when RPC returns empty array', async () => {
      seedRpc('report_summary', []);

      const result = await getSummary('user-1');

      // data?.[0] is undefined, so fallback kicks in
      expect(result).toEqual({ total_chats: 0, total_messages: 0, active_days: 0, avg_messages_per_day: 0 });
    });
  });

  describe('executeCustomQuery', () => {
    it('calls report_custom_query RPC with config', async () => {
      const config = { metric: 'messages_by_hour', groupBy: 'hour' };
      seedRpc('report_custom_query', (params) => {
        expect(params.p_user_id).toBe('user-1');
        expect(params.p_config).toEqual(config);
        return [{ hour: 10, count: 5 }];
      });

      const result = await executeCustomQuery('user-1', config);

      expect(result).toEqual([{ hour: 10, count: 5 }]);
    });
  });

  // ==================== SAVED REPORTS CRUD ====================

  describe('getSavedReports', () => {
    it('returns saved reports for the user sorted by updated_at desc', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'Report A', updated_at: '2025-01-01T00:00:00Z' },
        { id: 'r-2', user_id: 'user-1', name: 'Report B', updated_at: '2025-01-02T00:00:00Z' },
        { id: 'r-3', user_id: 'user-2', name: 'Other User Report', updated_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getSavedReports('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Report B');
      expect(result[1].name).toBe('Report A');
    });

    it('returns empty array when user has no saved reports', async () => {
      seedTable('saved_reports', []);

      const result = await getSavedReports('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getSavedReport', () => {
    it('returns a specific report by id and userId', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'My Report', report_config: { type: 'daily' } }
      ]);

      const result = await getSavedReport('r-1', 'user-1');

      expect(result.id).toBe('r-1');
      expect(result.name).toBe('My Report');
    });

    it('returns null when report is not found', async () => {
      seedTable('saved_reports', []);

      const report = await getSavedReport('nonexistent', 'user-1');
      expect(report).toBeNull();
    });
  });

  describe('createSavedReport', () => {
    it('inserts a new saved report', async () => {
      seedTable('saved_reports', []);

      const result = await createSavedReport('user-1', {
        name: 'Daily Messages',
        description: 'Messages per day',
        reportConfig: { type: 'daily', days: 30 }
      });

      expect(result.user_id).toBe('user-1');
      expect(result.name).toBe('Daily Messages');
      expect(result.report_config).toEqual({ type: 'daily', days: 30 });
    });

    it('defaults description to empty string', async () => {
      seedTable('saved_reports', []);

      const result = await createSavedReport('user-1', {
        name: 'Simple Report',
        reportConfig: {}
      });

      expect(result.description).toBe('');
    });
  });

  describe('updateSavedReport', () => {
    it('updates report name', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'Old Name', description: 'Desc' }
      ]);

      const result = await updateSavedReport('r-1', 'user-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('updates report config', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'Report', report_config: { old: true } }
      ]);

      const result = await updateSavedReport('r-1', 'user-1', {
        reportConfig: { new: true, days: 7 }
      });

      expect(result.report_config).toEqual({ new: true, days: 7 });
    });

    it('only updates provided fields', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'Report', description: 'Keep this' }
      ]);

      const result = await updateSavedReport('r-1', 'user-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(result.description).toBe('Keep this');
    });
  });

  describe('deleteSavedReport', () => {
    it('removes the saved report', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'To Delete' },
        { id: 'r-2', user_id: 'user-1', name: 'Keep' }
      ]);

      await deleteSavedReport('r-1', 'user-1');

      const remaining = await getSavedReports('user-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('r-2');
    });
  });

  describe('updateReportResult', () => {
    it('updates last_result and last_run_at for the report', async () => {
      seedTable('saved_reports', [
        { id: 'r-1', user_id: 'user-1', name: 'Report', last_result: null, last_run_at: null }
      ]);

      const resultData = { rows: [{ day: '2025-01-01', count: 5 }] };
      await updateReportResult('r-1', 'user-1', resultData);

      // Verify by reading back
      const report = await getSavedReport('r-1', 'user-1');
      expect(report.last_result).toEqual(resultData);
      expect(report.last_run_at).toBeDefined();
    });
  });
});
