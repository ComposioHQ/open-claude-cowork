import { getAdminClient } from './client.js';

const db = () => getAdminClient();

// Validate table name to prevent injection — only lowercase letters, digits, underscores
function validateTableName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Table name is required');
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: "${name}". Only lowercase letters, digits, and underscores are allowed.`);
  }
}

// Process row values for display — truncate vector columns
export function processRowsForDisplay(rows, columns) {
  if (!rows?.length || !columns?.length) return rows || [];

  const vectorColumns = columns
    .filter(col => col.data_type && col.data_type.toLowerCase().includes('vector'))
    .map(col => col.column_name);

  if (vectorColumns.length === 0) return rows;

  return rows.map(row => {
    const processed = { ...row };
    for (const colName of vectorColumns) {
      const value = processed[colName];
      if (value == null) continue;

      if (Array.isArray(value)) {
        const dims = value.length;
        const preview = value.slice(0, 3).map(v => Number(v).toFixed(6));
        processed[colName] = `[${preview.join(', ')}, ... (${dims} dims)]`;
      } else if (typeof value === 'string') {
        // Try to parse vector string format like "[0.1,0.2,0.3,...]" or "(0.1,0.2,0.3,...)"
        const match = value.match(/^[\[(]([-\d.,eE+\s]+)[\])]$/);
        if (match) {
          const parts = match[1].split(',').map(s => s.trim()).filter(Boolean);
          const dims = parts.length;
          if (dims > 3) {
            const preview = parts.slice(0, 3).map(v => Number(v).toFixed(6));
            processed[colName] = `[${preview.join(', ')}, ... (${dims} dims)]`;
          }
        }
      }
    }
    return processed;
  });
}

export async function listTables() {
  const { data, error } = await db().rpc('db_explorer_list_tables');
  if (error) throw error;
  return data;
}

export async function getTableColumns(tableName) {
  validateTableName(tableName);
  const { data, error } = await db().rpc('db_explorer_table_columns', { p_table_name: tableName });
  if (error) throw error;
  return data;
}

export async function getTableIndexes(tableName) {
  validateTableName(tableName);
  const { data, error } = await db().rpc('db_explorer_table_indexes', { p_table_name: tableName });
  if (error) throw error;
  return data;
}

export async function getTableRows(tableName, { sortColumn, sortDirection, pageOffset, pageSize, search } = {}) {
  validateTableName(tableName);
  const { data, error } = await db().rpc('db_explorer_table_rows', {
    p_table_name: tableName,
    p_sort_column: sortColumn || null,
    p_sort_direction: sortDirection || 'ASC',
    p_page_offset: pageOffset || 0,
    p_page_size: pageSize || 25,
    p_search: search || null
  });
  if (error) throw error;
  return data;
}

export async function getDatabaseStats() {
  const { data, error } = await db().rpc('db_explorer_stats');
  if (error) throw error;
  return data?.[0] || data;
}
