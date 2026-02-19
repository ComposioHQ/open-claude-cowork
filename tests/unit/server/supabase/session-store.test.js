import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedTable, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import { getProviderSession, setProviderSession } from '../../../../server/supabase/session-store.js';

describe('session-store.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  describe('getProviderSession', () => {
    it('returns session_id when session exists', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-1', provider: 'claude', session_id: 'sess-abc123', user_id: 'user-1' }
      ]);

      const result = await getProviderSession('chat-1', 'claude', 'user-1');

      expect(result).toBe('sess-abc123');
    });

    it('returns null when no session exists (PGRST116)', async () => {
      seedTable('provider_sessions', []);

      const result = await getProviderSession('chat-1', 'claude', 'user-1');

      expect(result).toBeNull();
    });

    it('returns null when session exists for different provider', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-1', provider: 'other-provider', session_id: 'sess-xyz', user_id: 'user-1' }
      ]);

      const result = await getProviderSession('chat-1', 'claude', 'user-1');

      expect(result).toBeNull();
    });

    it('returns null when session exists for different chat', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-2', provider: 'claude', session_id: 'sess-other', user_id: 'user-1' }
      ]);

      const result = await getProviderSession('chat-1', 'claude', 'user-1');

      expect(result).toBeNull();
    });

    it('returns null when userId does not match session owner', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-1', provider: 'claude', session_id: 'sess-user1', user_id: 'user-1' }
      ]);

      const result = await getProviderSession('chat-1', 'claude', 'user-2');

      expect(result).toBeNull();
    });
  });

  describe('setProviderSession', () => {
    it('inserts a new provider session', async () => {
      seedTable('provider_sessions', []);

      await setProviderSession('chat-1', 'claude', 'sess-new', 'user-1');

      // Verify by reading it back
      const result = await getProviderSession('chat-1', 'claude', 'user-1');
      expect(result).toBe('sess-new');
    });

    it('upserts (updates) an existing session on conflict', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-1', provider: 'claude', session_id: 'sess-old', user_id: 'user-1' }
      ]);

      await setProviderSession('chat-1', 'claude', 'sess-updated', 'user-1');

      const result = await getProviderSession('chat-1', 'claude');
      expect(result).toBe('sess-updated');
    });

    it('does not affect other providers for the same chat', async () => {
      seedTable('provider_sessions', [
        { chat_id: 'chat-1', provider: 'other-provider', session_id: 'sess-other', user_id: 'user-1' }
      ]);

      await setProviderSession('chat-1', 'claude', 'sess-claude', 'user-1');

      const otherProvider = await getProviderSession('chat-1', 'other-provider', 'user-1');
      const claude = await getProviderSession('chat-1', 'claude', 'user-1');

      expect(otherProvider).toBe('sess-other');
      expect(claude).toBe('sess-claude');
    });
  });
});
