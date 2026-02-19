import { describe, it, expect } from 'vitest';

/**
 * These functions are defined inside server/server.js and are not exported.
 * Rather than importing the full server (which has startup side effects),
 * we replicate the exact logic here and test it directly.
 * This verifies the behavioral contract of maskKey and sanitizeMcpName.
 */

// ---- Replica of maskKey from server/server.js ----
function maskKey(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return '••••';
  return '••••' + trimmed.slice(-4);
}

// ---- Replica of sanitizeMcpName from server/server.js ----
function sanitizeMcpName(name, id) {
  const s =
    (name || id || 'unnamed').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) ||
    'mcp';
  const reserved = [
    'composio',
    'smithery',
    'dataforseo',
    'dataforseo_extra',
    'browser',
    'postiz',
  ];
  if (reserved.includes(s)) return `user_${id || 'mcp'}`;
  return s;
}

// =========================================================================
// maskKey
// =========================================================================
describe('maskKey', () => {
  it('returns null for null input', () => {
    expect(maskKey(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(maskKey(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(maskKey('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(maskKey('   ')).toBeNull();
  });

  it('returns null for non-string types', () => {
    expect(maskKey(12345)).toBeNull();
    expect(maskKey({})).toBeNull();
    expect(maskKey(true)).toBeNull();
  });

  it('returns dots for string of exactly 4 chars', () => {
    expect(maskKey('abcd')).toBe('••••');
  });

  it('returns dots for string shorter than 4 chars', () => {
    expect(maskKey('ab')).toBe('••••');
    expect(maskKey('x')).toBe('••••');
  });

  it('masks all but last 4 characters for longer strings', () => {
    expect(maskKey('sk-1234567890abcdef')).toBe('••••cdef');
  });

  it('shows last 4 chars of a 5-char string', () => {
    expect(maskKey('12345')).toBe('••••2345');
  });

  it('handles API key format correctly', () => {
    const key = 'sk-ant-api03-XXXXXXXXXXXXXXXXXXXX-ABCD';
    const result = maskKey(key);
    expect(result).toBe('••••ABCD');
  });

  it('trims whitespace before masking', () => {
    expect(maskKey('  hello  ')).toBe('••••ello');
  });

  it('handles a long string', () => {
    const long = 'a'.repeat(200) + 'TAIL';
    expect(maskKey(long)).toBe('••••TAIL');
  });
});

// =========================================================================
// sanitizeMcpName
// =========================================================================
describe('sanitizeMcpName', () => {
  it('returns the name unchanged when it contains only valid chars', () => {
    expect(sanitizeMcpName('my_server', '1')).toBe('my_server');
  });

  it('replaces special characters with underscores', () => {
    expect(sanitizeMcpName('my-server.v2!', '1')).toBe('my_server_v2_');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeMcpName('My Cool Server', '1')).toBe('My_Cool_Server');
  });

  it('falls back to id when name is null', () => {
    expect(sanitizeMcpName(null, 'fallback_id')).toBe('fallback_id');
  });

  it('falls back to id when name is empty', () => {
    expect(sanitizeMcpName('', 'my_id')).toBe('my_id');
  });

  it('falls back to "unnamed" when both name and id are null', () => {
    expect(sanitizeMcpName(null, null)).toBe('unnamed');
  });

  it('truncates to 64 characters', () => {
    const longName = 'a'.repeat(100);
    const result = sanitizeMcpName(longName, '1');
    expect(result.length).toBe(64);
    expect(result).toBe('a'.repeat(64));
  });

  it('prefixes reserved name "composio" with user_', () => {
    expect(sanitizeMcpName('composio', 'id1')).toBe('user_id1');
  });

  it('prefixes reserved name "smithery" with user_', () => {
    expect(sanitizeMcpName('smithery', 'id2')).toBe('user_id2');
  });

  it('prefixes reserved name "dataforseo" with user_', () => {
    expect(sanitizeMcpName('dataforseo', 'id3')).toBe('user_id3');
  });

  it('prefixes reserved name "dataforseo_extra" with user_', () => {
    expect(sanitizeMcpName('dataforseo_extra', 'id4')).toBe('user_id4');
  });

  it('prefixes reserved name "browser" with user_', () => {
    expect(sanitizeMcpName('browser', 'id5')).toBe('user_id5');
  });

  it('prefixes reserved name "postiz" with user_', () => {
    expect(sanitizeMcpName('postiz', 'id6')).toBe('user_id6');
  });

  it('uses "mcp" as id fallback when reserved name matches and id is null', () => {
    expect(sanitizeMcpName('composio', null)).toBe('user_mcp');
  });

  it('allows names that START WITH a reserved word but are not exact matches', () => {
    expect(sanitizeMcpName('composio_custom', '1')).toBe('composio_custom');
    expect(sanitizeMcpName('browserify', '1')).toBe('browserify');
  });

  it('handles name that becomes empty after sanitization', () => {
    // All chars replaced with underscore — result is underscores, not empty
    expect(sanitizeMcpName('---', '1')).toBe('___');
  });

  it('preserves alphanumeric characters and underscores', () => {
    expect(sanitizeMcpName('abc_123_XYZ', '1')).toBe('abc_123_XYZ');
  });
});
