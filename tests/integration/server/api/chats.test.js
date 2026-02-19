/**
 * Integration tests for Chat CRUD + Messages + Profile endpoints.
 *
 * Routes tested:
 *   GET    /api/chats
 *   GET    /api/chats/:chatId
 *   POST   /api/chats
 *   PATCH  /api/chats/:chatId
 *   DELETE /api/chats/:chatId
 *   POST   /api/messages
 */

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createMockSupabaseClient,
  resetMockDB,
  seedTable,
  seedAuthUser
} from '../../../mocks/supabase.js';
import { TEST_USER, createTestToken, createAuthHeaders } from '../../../helpers/auth-helper.js';
import { sampleChat, sampleMessages } from '../../../fixtures/messages.js';

// --------------- Mock Supabase BEFORE any server module is imported ---------------
const mockClient = createMockSupabaseClient();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient)
}));

// --------------- Now import the test app builder + supertest ---------------
import { createTestApp } from '../../../helpers/server-helper.js';
import request from 'supertest';

describe('Chat CRUD endpoints', () => {
  let app;
  let token;
  const ORIG_ENV = { ...process.env };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon';
    process.env.ALLOW_ANONYMOUS = 'false';

    app = await createTestApp();
  });

  beforeEach(() => {
    resetMockDB();
    process.env.ALLOW_ANONYMOUS = 'false';
    token = createTestToken(TEST_USER);
    seedAuthUser(token, TEST_USER);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  // ===================== GET /api/chats =====================

  describe('GET /api/chats', () => {
    it('returns an empty list when the user has no chats', async () => {
      seedTable('chats', []);

      const res = await request(app)
        .get('/api/chats')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chats: [] });
    });

    it('returns only chats belonging to the authenticated user', async () => {
      seedTable('chats', [
        { ...sampleChat, user_id: TEST_USER.id },
        { id: 'other-chat', user_id: 'other-user', title: 'Not mine', provider: 'claude', model: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
      ]);

      const res = await request(app)
        .get('/api/chats')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].user_id).toBe(TEST_USER.id);
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/chats');
      expect(res.status).toBe(401);
    });
  });

  // ===================== GET /api/chats/:chatId =====================

  describe('GET /api/chats/:chatId', () => {
    it('returns a chat with its messages', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);
      seedTable('messages', sampleMessages);

      const res = await request(app)
        .get(`/api/chats/${sampleChat.id}`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleChat.id);
      expect(res.body.messages).toHaveLength(2);
    });

    it('returns 404 when chat does not exist', async () => {
      seedTable('chats', []);

      const res = await request(app)
        .get('/api/chats/nonexistent-id')
        .set(createAuthHeaders(token));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Chat not found');
    });

    it('returns 404 when chat belongs to a different user', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: 'other-user' }]);

      const res = await request(app)
        .get(`/api/chats/${sampleChat.id}`)
        .set(createAuthHeaders(token));

      // The chat exists but not for this user, so the query returns no rows
      expect(res.status).toBe(404);
    });
  });

  // ===================== POST /api/chats =====================

  describe('POST /api/chats', () => {
    it('creates a new chat and returns it', async () => {
      seedTable('chats', []);

      const payload = {
        id: 'new-chat-1',
        title: 'My new conversation',
        provider: 'claude',
        model: 'claude-sonnet-4-20250514'
      };

      const res = await request(app)
        .post('/api/chats')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('new-chat-1');
      expect(res.body.title).toBe('My new conversation');
      expect(res.body.user_id).toBe(TEST_USER.id);
    });

    it('upserts when chat ID already exists', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);

      const payload = {
        id: sampleChat.id,
        title: 'Updated title via upsert',
        provider: 'claude',
        model: null
      };

      const res = await request(app)
        .post('/api/chats')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      // Should succeed (upsert)
      expect(res.body.title).toBe('Updated title via upsert');
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/chats')
        .send({ id: 'x', title: 'test' });

      expect(res.status).toBe(401);
    });
  });

  // ===================== PATCH /api/chats/:chatId =====================

  describe('PATCH /api/chats/:chatId', () => {
    it('updates the chat title', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);

      const res = await request(app)
        .patch(`/api/chats/${sampleChat.id}`)
        .set(createAuthHeaders(token))
        .send({ title: 'Renamed Chat' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Renamed Chat');
    });

    it('returns 500 when chat does not exist (update returns no row)', async () => {
      seedTable('chats', []);

      const res = await request(app)
        .patch('/api/chats/nonexistent')
        .set(createAuthHeaders(token))
        .send({ title: 'Nope' });

      // The mock update on an empty table returns error with code PGRST116
      expect([404, 500]).toContain(res.status);
    });
  });

  // ===================== DELETE /api/chats/:chatId =====================

  describe('DELETE /api/chats/:chatId', () => {
    it('deletes the chat and returns success', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);

      const res = await request(app)
        .delete(`/api/chats/${sampleChat.id}`)
        .set(createAuthHeaders(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('returns 200 even when the chat does not exist (idempotent delete)', async () => {
      seedTable('chats', []);

      const res = await request(app)
        .delete('/api/chats/nonexistent')
        .set(createAuthHeaders(token));

      // Supabase delete doesn't error on zero-row deletes
      expect(res.status).toBe(200);
    });
  });

  // ===================== POST /api/messages =====================

  describe('POST /api/messages', () => {
    it('adds a message to a chat', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);
      seedTable('messages', []);

      const payload = {
        chatId: sampleChat.id,
        role: 'user',
        content: 'Hello, Claude!',
        html: '',
        metadata: {}
      };

      const res = await request(app)
        .post('/api/messages')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('user');
      expect(res.body.content).toBe('Hello, Claude!');
      expect(res.body.chat_id).toBe(sampleChat.id);
      expect(res.body.user_id).toBe(TEST_USER.id);
    });

    it('stores metadata on assistant messages', async () => {
      seedTable('chats', [{ ...sampleChat, user_id: TEST_USER.id }]);
      seedTable('messages', []);

      const payload = {
        chatId: sampleChat.id,
        role: 'assistant',
        content: 'I can help with that.',
        metadata: { provider: 'claude', model: 'claude-sonnet-4-20250514' }
      };

      const res = await request(app)
        .post('/api/messages')
        .set(createAuthHeaders(token))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.metadata).toEqual({ provider: 'claude', model: 'claude-sonnet-4-20250514' });
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/messages')
        .send({ chatId: 'x', role: 'user', content: 'hi' });

      expect(res.status).toBe(401);
    });
  });
});
