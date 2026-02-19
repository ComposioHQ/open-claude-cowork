import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetMockDB, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

// Hoisted vi.mock — intercepts transitive ESM imports (unlike vi.doMock)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient)
}));

// Static imports now get the mocked createClient
import { createClient } from '@supabase/supabase-js';
import {
  getAdminClient,
  getUserClient,
  getPublicConfig,
  _resetAdminClient
} from '../../../../server/supabase/client.js';

describe('client.js', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    resetMockDB();
    _resetAdminClient();
    vi.mocked(createClient).mockClear();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  describe('getAdminClient', () => {
    it('creates a client with the service role key from env', () => {
      const client = getAdminClient();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-service-role-key',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      expect(client).toBeDefined();
    });

    it('returns the same cached client on subsequent calls', () => {
      const first = getAdminClient();
      const second = getAdminClient();

      expect(first).toBe(second);
    });

    it('throws when SUPABASE_URL is missing', () => {
      delete process.env.SUPABASE_URL;

      expect(() => getAdminClient()).toThrow('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    });

    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => getAdminClient()).toThrow('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    });
  });

  describe('getUserClient', () => {
    it('creates a per-request client with the access token in headers', () => {
      const client = getUserClient('user-jwt-token');

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        {
          global: { headers: { Authorization: 'Bearer user-jwt-token' } },
          auth: { autoRefreshToken: false, persistSession: false }
        }
      );
      expect(client).toBeDefined();
    });

    it('creates a new client for each call (no caching)', () => {
      getUserClient('token-a');
      getUserClient('token-b');

      // Count calls that were for getUserClient (anon key calls)
      const userCalls = vi.mocked(createClient).mock.calls.filter(c => c[1] === 'test-anon-key');
      expect(userCalls.length).toBe(2);
    });

    it('throws when SUPABASE_URL is missing', () => {
      delete process.env.SUPABASE_URL;

      expect(() => getUserClient('token')).toThrow('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
    });

    it('throws when SUPABASE_ANON_KEY is missing', () => {
      delete process.env.SUPABASE_ANON_KEY;

      expect(() => getUserClient('token')).toThrow('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
    });
  });

  describe('getPublicConfig', () => {
    it('returns URL and anon key from env', () => {
      const config = getPublicConfig();

      expect(config).toEqual({
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key'
      });
    });

    it('returns empty strings when env vars are not set', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      const config = getPublicConfig();

      expect(config).toEqual({
        supabaseUrl: '',
        supabaseAnonKey: ''
      });
    });
  });
});
