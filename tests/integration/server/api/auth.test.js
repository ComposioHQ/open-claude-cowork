/**
 * Integration tests for Profile and Database-access endpoints.
 *
 * Routes tested:
 *   GET    /api/profile
 *   PATCH  /api/profile
 *   GET    /api/database/access
 *   GET    /api/config
 *   GET    /api/health
 *   GET    /api/providers
 */

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createMockSupabaseClient,
  resetMockDB,
  seedTable,
  seedAuthUser
} from '../../../mocks/supabase.js';
import {
  TEST_USER,
  TEST_ADMIN,
  ANONYMOUS_USER,
  createTestToken,
  createAuthHeaders
} from '../../../helpers/auth-helper.js';

// --------------- Mock Supabase ---------------
const mockClient = createMockSupabaseClient();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient)
}));

// --------------- Imports ---------------
import { createTestApp } from '../../../helpers/server-helper.js';
import request from 'supertest';

describe('Auth, Profile, and Access endpoints', () => {
  let app;
  let userToken;
  let adminToken;
  const ORIG_ENV = { ...process.env };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon';
    process.env.ALLOW_ANONYMOUS = 'false';
    process.env.ADMIN_EMAILS = 'admin@test.com';

    app = await createTestApp();
  });

  beforeEach(() => {
    resetMockDB();
    process.env.ALLOW_ANONYMOUS = 'false';
    process.env.ADMIN_EMAILS = 'admin@test.com';

    userToken = createTestToken(TEST_USER);
    adminToken = createTestToken(TEST_ADMIN);

    seedAuthUser(userToken, TEST_USER);
    seedAuthUser(adminToken, TEST_ADMIN);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  // ===================== GET /api/profile =====================

  describe('GET /api/profile', () => {
    it('returns the user profile when it exists', async () => {
      const profileRow = {
        id: TEST_USER.id,
        email: TEST_USER.email,
        display_name: 'Test User',
        avatar_url: null,
        created_at: '2025-01-01T00:00:00Z'
      };
      seedTable('profiles', [profileRow]);

      const res = await request(app)
        .get('/api/profile')
        .set(createAuthHeaders(userToken));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(TEST_USER.id);
      expect(res.body.display_name).toBe('Test User');
    });

    it('returns empty object when profile does not exist', async () => {
      seedTable('profiles', []);

      const res = await request(app)
        .get('/api/profile')
        .set(createAuthHeaders(userToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/profile');
      expect(res.status).toBe(401);
    });
  });

  // ===================== PATCH /api/profile =====================

  describe('PATCH /api/profile', () => {
    it('updates the user profile fields', async () => {
      seedTable('profiles', [
        { id: TEST_USER.id, email: TEST_USER.email, display_name: 'Old Name', avatar_url: null }
      ]);

      const res = await request(app)
        .patch('/api/profile')
        .set(createAuthHeaders(userToken))
        .send({ display_name: 'New Name', avatar_url: 'https://example.com/img.png' });

      expect(res.status).toBe(200);
      expect(res.body.display_name).toBe('New Name');
      expect(res.body.avatar_url).toBe('https://example.com/img.png');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .patch('/api/profile')
        .send({ display_name: 'Hacker' });

      expect(res.status).toBe(401);
    });
  });

  // ===================== GET /api/database/access =====================

  describe('GET /api/database/access', () => {
    it('returns allowed=true and connection metadata for admin user', async () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      const res = await request(app)
        .get('/api/database/access')
        .set(createAuthHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.supabaseUrl).toBe(process.env.SUPABASE_URL);
      expect(res.body.projectRef).toBe(res.body.supabaseUrl ? new URL(res.body.supabaseUrl).hostname.replace(/\.supabase\.co$/, '') : null);
      expect(res.body.dashboardUrl).toBe(res.body.projectRef ? `https://supabase.com/dashboard/project/${res.body.projectRef}` : null);
      expect(res.body.databaseName).toBe('postgres');
    });

    it('returns allowed=false but connection metadata for non-admin user', async () => {
      process.env.ADMIN_EMAILS = 'admin@test.com';

      const res = await request(app)
        .get('/api/database/access')
        .set(createAuthHeaders(userToken));

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
      expect(res.body.configured).toBe(true);
      expect(res.body.supabaseUrl).toBe(process.env.SUPABASE_URL);
      expect(res.body.projectRef).toBe(res.body.supabaseUrl ? new URL(res.body.supabaseUrl).hostname.replace(/\.supabase\.co$/, '') : null);
      expect(res.body.dashboardUrl).toBe(res.body.projectRef ? `https://supabase.com/dashboard/project/${res.body.projectRef}` : null);
      expect(res.body.databaseName).toBe('postgres');
    });

    it('returns allowed=false and null metadata when Supabase is not configured', async () => {
      const noSupaApp = await createTestApp({ supabaseConfigured: false });

      const res = await request(noSupaApp)
        .get('/api/database/access')
        .set(createAuthHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
      expect(res.body.configured).toBe(false);
      expect(res.body.supabaseUrl).toBeNull();
      expect(res.body.projectRef).toBeNull();
      expect(res.body.dashboardUrl).toBeNull();
      expect(res.body.databaseName).toBeNull();
    });
  });

  // ===================== Anonymous access =====================

  describe('Anonymous access', () => {
    it('allows anonymous requests when ALLOW_ANONYMOUS=true', async () => {
      process.env.ALLOW_ANONYMOUS = 'true';
      seedTable('chats', []);

      const anonApp = await createTestApp();

      const res = await request(anonApp)
        .get('/api/chats');

      expect(res.status).toBe(200);
      expect(res.body.chats).toEqual([]);
    });

    it('rejects requests without token when ALLOW_ANONYMOUS is not true', async () => {
      process.env.ALLOW_ANONYMOUS = 'false';
      const strictApp = await createTestApp();

      const res = await request(strictApp)
        .get('/api/chats');

      expect(res.status).toBe(401);
    });
  });

  // ===================== GET /api/config =====================

  describe('GET /api/config', () => {
    it('returns Supabase public config', async () => {
      process.env.SUPABASE_URL = 'https://my-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'sb_publishable_abc123';

      const res = await request(app).get('/api/config');

      expect(res.status).toBe(200);
      expect(res.body.supabaseUrl).toBe('https://my-project.supabase.co');
      expect(res.body.supabaseAnonKey).toBe('sb_publishable_abc123');
    });

    it('returns empty strings when env vars are missing', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      // Need a fresh app since the route reads env at request time
      const freshApp = await createTestApp();
      const res = await request(freshApp).get('/api/config');

      expect(res.status).toBe(200);
      expect(res.body.supabaseUrl).toBe('');
      expect(res.body.supabaseAnonKey).toBe('');
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
    });
  });

  // ===================== GET /api/health =====================

  describe('GET /api/health', () => {
    it('returns ok status with providers list', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeTruthy();
      expect(Array.isArray(res.body.providers)).toBe(true);
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });
  });

  // ===================== GET /api/providers =====================

  describe('GET /api/providers', () => {
    it('returns list of providers with default', async () => {
      const res = await request(app).get('/api/providers');

      expect(res.status).toBe(200);
      expect(res.body.providers).toEqual(expect.arrayContaining(['claude']));
      expect(res.body.default).toBe('claude');
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/api/providers');
      expect(res.status).toBe(200);
    });
  });
});
