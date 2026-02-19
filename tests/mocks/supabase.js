/**
 * In-memory Supabase mock — chainable query builder.
 * Supports .from(table).select().eq().order().limit().single().insert().upsert().update().delete().rpc().not().in().lte()
 * Also mocks .storage.from(bucket).upload()/.createSignedUrl()/.remove()
 * And .auth.getUser(token)
 */

import { vi } from 'vitest';

// In-memory tables
const tables = new Map();
const rpcResults = new Map();
const storageFiles = new Map();
const authUsers = new Map();

export function resetMockDB() {
  tables.clear();
  rpcResults.clear();
  storageFiles.clear();
  authUsers.clear();
}

export function seedTable(tableName, rows) {
  tables.set(tableName, [...rows]);
}

export function getTable(tableName) {
  return tables.get(tableName) || [];
}

export function seedRpc(rpcName, result) {
  rpcResults.set(rpcName, result);
}

export function seedAuthUser(token, user) {
  authUsers.set(token, user);
}

function applyFilters(rows, filters) {
  let result = [...rows];
  for (const { column, op, value } of filters) {
    if (op === 'eq') {
      result = result.filter(r => r[column] === value);
    } else if (op === 'is_null') {
      result = result.filter(r => r[column] === null || r[column] === undefined);
    } else if (op === 'not.eq') {
      result = result.filter(r => r[column] !== value);
    } else if (op === 'in') {
      result = result.filter(r => value.includes(r[column]));
    } else if (op === 'lte') {
      result = result.filter(r => r[column] <= value);
    }
  }
  return result;
}

function createQueryBuilder(tableName) {
  let filters = [];
  let selectColumns = '*';
  let orderCol = null;
  let orderAsc = true;
  let limitNum = null;
  let isSingle = false;
  let operation = 'select'; // select, insert, upsert, update, delete
  let insertData = null;
  let updateData = null;
  let upsertOpts = {};

  const builder = {
    select(cols) {
      selectColumns = cols || '*';
      // Only set operation to 'select' if no mutating operation (insert/update/upsert/delete)
      // is already in progress. This allows chains like .insert(data).select().single()
      // and .update(data).eq().select().single() to work correctly.
      if (!insertData && !updateData && operation !== 'delete' && operation !== 'upsert') {
        operation = 'select';
      }
      return builder;
    },
    eq(column, value) {
      filters.push({ column, op: 'eq', value });
      return builder;
    },
    is(column, value) {
      if (value === null) {
        filters.push({ column, op: 'is_null', value: null });
      } else {
        filters.push({ column, op: 'eq', value });
      }
      return builder;
    },
    not(column, op, value) {
      filters.push({ column, op: `not.${op}`, value });
      return builder;
    },
    in(column, values) {
      filters.push({ column, op: 'in', value: values });
      return builder;
    },
    lte(column, value) {
      filters.push({ column, op: 'lte', value });
      return builder;
    },
    order(column, opts = {}) {
      orderCol = column;
      orderAsc = opts.ascending !== false;
      return builder;
    },
    limit(n) {
      limitNum = n;
      return builder;
    },
    single() {
      isSingle = true;
      return builder.then ? builder : makeThenable();
    },
    insert(data) {
      operation = 'insert';
      insertData = Array.isArray(data) ? data : [data];
      return builder;
    },
    upsert(data, opts = {}) {
      operation = 'upsert';
      insertData = Array.isArray(data) ? data : [data];
      upsertOpts = opts;
      return builder;
    },
    update(data) {
      operation = 'update';
      updateData = data;
      return builder;
    },
    delete() {
      operation = 'delete';
      return builder;
    }
  };

  function execute() {
    let rows = tables.get(tableName) || [];

    if (operation === 'insert') {
      rows = [...rows, ...insertData];
      tables.set(tableName, rows);
      const result = insertData;
      let data = applyFilters(result, filters);
      if (isSingle) return { data: data[0] || insertData[0], error: null };
      return { data: result, error: null };
    }

    if (operation === 'upsert') {
      const conflict = upsertOpts.onConflict;
      for (const item of insertData) {
        if (conflict) {
          const conflictFields = conflict.split(',').map(s => s.trim());
          const idx = rows.findIndex(r =>
            conflictFields.every(f => r[f] === item[f])
          );
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...item };
          } else {
            rows.push(item);
          }
        } else {
          rows.push(item);
        }
      }
      tables.set(tableName, rows);
      let data = applyFilters(rows, filters);
      if (isSingle) return { data: data[0] || insertData[0], error: null };
      return { data: insertData, error: null };
    }

    if (operation === 'update') {
      let filtered = applyFilters(rows, filters);
      for (const row of filtered) {
        Object.assign(row, updateData);
      }
      tables.set(tableName, rows);
      if (isSingle) return { data: filtered[0] || null, error: filtered.length ? null : { code: 'PGRST116', message: 'not found' } };
      return { data: filtered, error: null };
    }

    if (operation === 'delete') {
      const filtered = applyFilters(rows, filters);
      const remaining = rows.filter(r => !filtered.includes(r));
      tables.set(tableName, remaining);
      return { data: null, error: null };
    }

    // Select
    let result = applyFilters(rows, filters);

    if (orderCol) {
      result.sort((a, b) => {
        if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1;
        if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1;
        return 0;
      });
    }

    if (limitNum !== null) {
      result = result.slice(0, limitNum);
    }

    if (isSingle) {
      if (result.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      }
      return { data: result[0], error: null };
    }

    return { data: result, error: null };
  }

  function makeThenable() {
    builder.then = (resolve, reject) => {
      try {
        resolve(execute());
      } catch (e) {
        if (reject) reject(e);
      }
    };
    return builder;
  }

  // Make the builder thenable by default
  builder.then = (resolve, reject) => {
    try {
      resolve(execute());
    } catch (e) {
      if (reject) reject(e);
    }
  };

  return builder;
}

function createStorageMock() {
  return {
    from(bucket) {
      return {
        upload(path, buffer, opts = {}) {
          storageFiles.set(`${bucket}/${path}`, { buffer, ...opts });
          return Promise.resolve({ data: { path }, error: null });
        },
        createSignedUrl(path, expiresIn) {
          return Promise.resolve({
            data: { signedUrl: `https://test.supabase.co/storage/${bucket}/${path}?token=signed&expires=${expiresIn}` },
            error: null
          });
        },
        remove(paths) {
          for (const p of paths) {
            storageFiles.delete(`${bucket}/${p}`);
          }
          return Promise.resolve({ data: paths, error: null });
        }
      };
    }
  };
}

function createAuthMock() {
  return {
    async getUser(token) {
      const user = authUsers.get(token);
      if (user) {
        return { data: { user }, error: null };
      }
      return { data: { user: null }, error: { message: 'Invalid token' } };
    }
  };
}

export function createMockSupabaseClient() {
  const client = {
    from(tableName) {
      return createQueryBuilder(tableName);
    },
    rpc(rpcName, params) {
      const result = rpcResults.get(rpcName);
      if (result instanceof Function) {
        return Promise.resolve({ data: result(params), error: null });
      }
      if (result !== undefined) {
        return Promise.resolve({ data: result, error: null });
      }
      // Return a thenable that catches errors for pg_cron-style calls
      return {
        then: (resolve) => resolve({ data: null, error: null }),
        catch: (handler) => {
          return Promise.resolve({ data: null, error: null });
        }
      };
    },
    storage: createStorageMock(),
    auth: createAuthMock()
  };
  return client;
}

// The mock for @supabase/supabase-js
export const mockCreateClient = vi.fn(() => createMockSupabaseClient());
