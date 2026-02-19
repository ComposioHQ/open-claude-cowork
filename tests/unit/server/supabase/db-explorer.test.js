import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedRpc, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import {
  processRowsForDisplay,
  listTables,
  getTableColumns,
  getTableIndexes,
  getTableRows,
  getDatabaseStats
} from '../../../../server/supabase/db-explorer.js';

describe('db-explorer.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  describe('validateTableName (tested via getTableRows)', () => {
    it('allows valid table names with lowercase letters and underscores', async () => {
      seedRpc('db_explorer_table_rows', []);

      await expect(getTableRows('valid_table')).resolves.toEqual([]);
      await expect(getTableRows('my_table_123')).resolves.toEqual([]);
      await expect(getTableRows('_private')).resolves.toEqual([]);
    });

    it('rejects names with uppercase letters', async () => {
      await expect(getTableRows('InvalidTable')).rejects.toThrow('Invalid table name');
    });

    it('rejects names with spaces', async () => {
      await expect(getTableRows('my table')).rejects.toThrow('Invalid table name');
    });

    it('rejects SQL injection attempts', async () => {
      await expect(getTableRows('users; DROP TABLE users;--')).rejects.toThrow('Invalid table name');
      await expect(getTableRows("users' OR '1'='1")).rejects.toThrow('Invalid table name');
    });

    it('rejects names starting with digits', async () => {
      await expect(getTableRows('123table')).rejects.toThrow('Invalid table name');
    });

    it('rejects empty or null names', async () => {
      await expect(getTableRows('')).rejects.toThrow('Table name is required');
      await expect(getTableRows(null)).rejects.toThrow('Table name is required');
      await expect(getTableRows(undefined)).rejects.toThrow('Table name is required');
    });

    it('rejects names with special characters', async () => {
      await expect(getTableRows('table-name')).rejects.toThrow('Invalid table name');
      await expect(getTableRows('table.name')).rejects.toThrow('Invalid table name');
    });
  });

  describe('processRowsForDisplay', () => {
    it('truncates vector columns in array format', () => {
      const columns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'embedding', data_type: 'vector(1536)' }
      ];
      const rows = [
        { id: 1, embedding: [0.123456789, 0.234567890, 0.345678901, 0.456, 0.567, 0.678] }
      ];

      const result = processRowsForDisplay(rows, columns);

      expect(result[0].id).toBe(1);
      expect(result[0].embedding).toBe('[0.123457, 0.234568, 0.345679, ... (6 dims)]');
    });

    it('truncates vector columns in string format', () => {
      const columns = [
        { column_name: 'embedding', data_type: 'vector' }
      ];
      const rows = [
        { embedding: '[0.1,0.2,0.3,0.4,0.5]' }
      ];

      const result = processRowsForDisplay(rows, columns);

      expect(result[0].embedding).toBe('[0.100000, 0.200000, 0.300000, ... (5 dims)]');
    });

    it('handles parenthesized vector string format', () => {
      const columns = [
        { column_name: 'vec', data_type: 'vector(3)' }
      ];
      const rows = [
        { vec: '(0.1,0.2,0.3,0.4)' }
      ];

      const result = processRowsForDisplay(rows, columns);

      expect(result[0].vec).toBe('[0.100000, 0.200000, 0.300000, ... (4 dims)]');
    });

    it('returns rows unchanged when no vector columns exist', () => {
      const columns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'name', data_type: 'text' }
      ];
      const rows = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ];

      const result = processRowsForDisplay(rows, columns);

      expect(result).toEqual(rows);
    });

    it('returns empty array when rows is empty', () => {
      const columns = [{ column_name: 'embedding', data_type: 'vector' }];
      expect(processRowsForDisplay([], columns)).toEqual([]);
    });

    it('returns empty array when rows is null', () => {
      expect(processRowsForDisplay(null, [])).toEqual([]);
    });

    it('handles null vector values gracefully', () => {
      const columns = [
        { column_name: 'embedding', data_type: 'vector(3)' }
      ];
      const rows = [{ embedding: null }];

      const result = processRowsForDisplay(rows, columns);

      expect(result[0].embedding).toBeNull();
    });

    it('leaves short vector strings unchanged (3 or fewer dims)', () => {
      const columns = [
        { column_name: 'vec', data_type: 'vector' }
      ];
      const rows = [
        { vec: '[0.1,0.2,0.3]' }
      ];

      const result = processRowsForDisplay(rows, columns);

      // Only truncates when dims > 3
      expect(result[0].vec).toBe('[0.1,0.2,0.3]');
    });
  });

  describe('listTables', () => {
    it('calls the db_explorer_list_tables RPC', async () => {
      const mockTables = [
        { table_name: 'chats', row_count: 10 },
        { table_name: 'messages', row_count: 100 }
      ];
      seedRpc('db_explorer_list_tables', mockTables);

      const result = await listTables();

      expect(result).toEqual(mockTables);
    });
  });

  describe('getTableColumns', () => {
    it('calls the RPC with the table name', async () => {
      const mockColumns = [
        { column_name: 'id', data_type: 'uuid' },
        { column_name: 'name', data_type: 'text' }
      ];
      seedRpc('db_explorer_table_columns', mockColumns);

      const result = await getTableColumns('chats');

      expect(result).toEqual(mockColumns);
    });

    it('rejects invalid table names before calling RPC', async () => {
      await expect(getTableColumns('DROP TABLE;')).rejects.toThrow('Invalid table name');
    });
  });

  describe('getTableIndexes', () => {
    it('calls the RPC with the table name', async () => {
      const mockIndexes = [
        { index_name: 'chats_pkey', column_name: 'id' }
      ];
      seedRpc('db_explorer_table_indexes', mockIndexes);

      const result = await getTableIndexes('chats');

      expect(result).toEqual(mockIndexes);
    });
  });

  describe('getTableRows', () => {
    it('passes pagination params to the RPC', async () => {
      seedRpc('db_explorer_table_rows', (params) => {
        expect(params.p_table_name).toBe('messages');
        expect(params.p_sort_column).toBe('created_at');
        expect(params.p_sort_direction).toBe('DESC');
        expect(params.p_page_offset).toBe(10);
        expect(params.p_page_size).toBe(50);
        expect(params.p_search).toBe('hello');
        return [{ id: 'msg-1' }];
      });

      const result = await getTableRows('messages', {
        sortColumn: 'created_at',
        sortDirection: 'DESC',
        pageOffset: 10,
        pageSize: 50,
        search: 'hello'
      });

      expect(result).toEqual([{ id: 'msg-1' }]);
    });

    it('uses default values when no options provided', async () => {
      seedRpc('db_explorer_table_rows', (params) => {
        expect(params.p_sort_column).toBeNull();
        expect(params.p_sort_direction).toBe('ASC');
        expect(params.p_page_offset).toBe(0);
        expect(params.p_page_size).toBe(25);
        expect(params.p_search).toBeNull();
        return [];
      });

      await getTableRows('chats');
    });
  });

  describe('getDatabaseStats', () => {
    it('returns the first element of the RPC result', async () => {
      seedRpc('db_explorer_stats', [{ total_size: '100MB', tables_count: 6 }]);

      const result = await getDatabaseStats();

      expect(result).toEqual({ total_size: '100MB', tables_count: 6 });
    });

    it('returns data directly when RPC returns a single object', async () => {
      seedRpc('db_explorer_stats', { total_size: '50MB' });

      const result = await getDatabaseStats();

      // When data is not an array, data?.[0] is undefined, so falls back to data
      expect(result).toEqual({ total_size: '50MB' });
    });
  });
});
