import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../../server/supabase/client.js', () => {
  // Use a simple in-memory mock; folder-store uses getAdminClient(), tests use supabase.seed/reset
  const tables = new Map();

  const applyFilters = (rows, filters) => {
    let result = [...rows];
    for (const f of filters) {
      if (f.op === 'eq') result = result.filter(r => r[f.column] === f.value);
    }
    return result;
  };

  const createBuilder = (table) => {
    let filters = [];
    let operation = 'select';
    let data = null;
    let isSingle = false;

    const builder = {
      select: () => builder,
      eq: (column, value) => { filters.push({ column, op: 'eq', value }); return builder; },
      order: () => builder,
      single: () => { isSingle = true; return builder; },
      insert: (d) => { operation = 'insert'; data = d; return builder; },
      update: (d) => { operation = 'update'; data = d; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      then: (resolve) => {
        let rows = tables.get(table) || [];
        if (operation === 'insert') {
          const newRows = Array.isArray(data) ? data : [data];
          rows = [...rows, ...newRows];
          tables.set(table, rows);
          resolve({ data: isSingle ? newRows[0] : newRows, error: null });
        } else if (operation === 'update') {
          const filtered = applyFilters(rows, filters);
          filtered.forEach(r => Object.assign(r, data));
          resolve({ data: isSingle ? filtered[0] : filtered, error: null });
        } else if (operation === 'delete') {
          const filtered = applyFilters(rows, filters);
          const remaining = rows.filter(r => !filtered.includes(r));
          tables.set(table, remaining);
          resolve({ data: null, error: null });
        } else {
          const result = applyFilters(rows, filters);
          resolve({ data: isSingle ? result[0] : result, error: null });
        }
      }
    };
    return builder;
  };

  const db = {
    from: (t) => createBuilder(t),
    seed: (t, d) => tables.set(t, d),
    reset: () => tables.clear()
  };

  return {
    getAdminClient: () => db,
    supabase: db
  };
});

import { supabase } from '../../../../server/supabase/client.js';
import { createFolder, getFolders, renameFolder, deleteFolder } from '../../../../server/supabase/folder-store.js';

describe('folder-store', () => {
  const userId = 'user-123';

  beforeEach(() => {
    supabase.reset();
  });

  describe('createFolder', () => {
    it('creates a folder for a specific type', async () => {
      const folder = await createFolder(userId, 'My Chats', 'chat');
      expect(folder.name).toBe('My Chats');
      expect(folder.type).toBe('chat');
      expect(folder.user_id).toBe(userId);
    });
  });

  describe('getFolders', () => {
    it('returns folders of a specific type for a user', async () => {
      supabase.seed('universal_folders', [
        { id: 'f1', user_id: userId, name: 'A', type: 'chat', parent_id: null },
        { id: 'f2', user_id: userId, name: 'B', type: 'chat', parent_id: null },
        { id: 'f3', user_id: userId, name: 'C', type: 'job', parent_id: null }
      ]);

      const chats = await getFolders(userId, 'chat');
      expect(chats).toHaveLength(2);
      expect(chats[0].name).toBe('A');
    });
  });

  describe('renameFolder', () => {
    it('updates the folder name', async () => {
      supabase.seed('universal_folders', [
        { id: 'f1', user_id: userId, name: 'Old Name', type: 'chat' }
      ]);

      const updated = await renameFolder('f1', userId, 'New Name');
      expect(updated.name).toBe('New Name');
    });
  });

  describe('deleteFolder', () => {
    it('deletes a folder', async () => {
      supabase.seed('universal_folders', [
        { id: 'f1', user_id: userId, name: 'Delete Me', type: 'chat' }
      ]);

      const result = await deleteFolder('f1', userId);
      expect(result).toBe(true);
    });
  });
});
