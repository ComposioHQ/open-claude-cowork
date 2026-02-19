import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetMockDB, seedAuthUser, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import { requireAuth, requireAdmin, isAdmin } from '../../../../server/supabase/auth-middleware.js';

// Helper to create mock Express req/res/next
function createMockReqRes(opts = {}) {
  const req = {
    headers: opts.headers || {},
    user: opts.user || null
  };
  const res = {
    _status: null,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._json = body;
      return res;
    }
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('auth-middleware.js', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    delete process.env.ALLOW_ANONYMOUS;
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  describe('requireAuth', () => {
    it('sets req.user and calls next when token is valid', async () => {
      const testUser = { id: 'user-1', email: 'user@test.com', role: 'authenticated' };
      seedAuthUser('valid-token', testUser);

      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer valid-token' }
      });

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({ id: 'user-1', email: 'user@test.com', role: 'authenticated' });
      expect(res._status).toBeNull();
    });

    it('returns 401 when token is invalid', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer bad-token' }
      });

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid or expired token' });
    });

    it('returns 401 when no token and ALLOW_ANONYMOUS is not true', async () => {
      process.env.ALLOW_ANONYMOUS = 'false';

      const { req, res, next } = createMockReqRes();

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Authentication required' });
    });

    it('sets anonymous user when no token and ALLOW_ANONYMOUS=true', async () => {
      process.env.ALLOW_ANONYMOUS = 'true';

      const { req, res, next } = createMockReqRes();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.email).toBeNull();
      expect(req.user.role).toBe('anon');
      expect(req.user.id).toMatch(/^anonymous:[0-9a-f]{16}$/);
    });

    it('uses explicit anonymous session id when provided', async () => {
      process.env.ALLOW_ANONYMOUS = 'true';

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-anon-session-id': 'session-abc',
          authorization: ''
        }
      });
      req.get = (name) => req.headers[name.toLowerCase()];

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe('anonymous:session-abc');
    });

    it('returns 401 when no Authorization header at all and ALLOW_ANONYMOUS is not set', async () => {
      const { req, res, next } = createMockReqRes();

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
    });

    it('returns 401 when Authorization header is not Bearer format', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Basic abc123' }
      });

      // With non-Bearer header, token will be null
      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
    });
  });

  describe('requireAdmin', () => {
    it('calls next when user email is in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com, other@test.com';

      const { req, res, next } = createMockReqRes();
      req.user = { id: 'user-1', email: 'admin@test.com', role: 'authenticated' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user email is not in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      const { req, res, next } = createMockReqRes();
      req.user = { id: 'user-2', email: 'other@test.com', role: 'authenticated' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
      expect(res._json).toEqual({ error: 'Admin access required' });
    });

    it('returns 403 when ADMIN_EMAILS is not configured', () => {
      // ADMIN_EMAILS is not set

      const { req, res, next } = createMockReqRes();
      req.user = { id: 'user-1', email: 'admin@test.com', role: 'authenticated' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
      expect(res._json).toEqual({ error: 'No admin emails configured' });
    });

    it('returns 403 when user has no email', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      const { req, res, next } = createMockReqRes();
      req.user = { id: 'anonymous', email: null, role: 'anon' };

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    });

    it('handles case-insensitive email matching', () => {
      process.env.ADMIN_EMAILS = 'Admin@Test.com';

      const { req, res, next } = createMockReqRes();
      req.user = { id: 'user-1', email: 'admin@test.com', role: 'authenticated' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('isAdmin', () => {
    it('returns true when email is in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com,super@test.com';

      expect(isAdmin('admin@test.com')).toBe(true);
    });

    it('returns false when email is not in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      expect(isAdmin('other@test.com')).toBe(false);
    });

    it('returns false when email is null or undefined', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });

    it('returns false when ADMIN_EMAILS is not set', () => {
      expect(isAdmin('admin@test.com')).toBe(false);
    });

    it('handles case-insensitive comparison', () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      expect(isAdmin('ADMIN@TEST.COM')).toBe(true);
    });
  });
});
