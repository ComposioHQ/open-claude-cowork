const MISSING_SCHEMA_ERROR_CODES = new Set([
  '42P01', // undefined_table
  '42883', // undefined_function
  'PGRST303' // function call not found / not available
]);

const MISSING_SCHEMA_ERROR_TEXTS = [
  'could not find the table',
  'could not find the function',
  'schema cache',
  'does not exist',
  'relation does not exist'
];

export function isAnonymousUserId(userId) {
  return typeof userId === 'string' && userId.startsWith('anonymous:');
}

export function isSchemaMissingError(error) {
  if (!error) return false;

  const code = String(error.code || '').toUpperCase();
  if (MISSING_SCHEMA_ERROR_CODES.has(code)) return true;

  const message = String(error.message || '').toLowerCase();
  return MISSING_SCHEMA_ERROR_TEXTS.some((fragment) => message.includes(fragment));
}

export function fallbackForMissingSchema(error, fallback) {
  if (isSchemaMissingError(error)) {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
  throw error;
}
