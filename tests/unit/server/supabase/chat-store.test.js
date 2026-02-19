import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedTable, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import {
  createChat,
  getUserChats,
  getChat,
  deleteChat,
  updateChatTitle,
  addMessage,
  getChatMessages,
  getProfile,
  updateProfile
} from '../../../../server/supabase/chat-store.js';

describe('chat-store.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  describe('createChat', () => {
    it('inserts a new chat via upsert', async () => {
      seedTable('chats', []);

      const result = await createChat({
        id: 'chat-1',
        userId: 'user-1',
        title: 'My Chat',
        provider: 'claude',
        model: 'opus'
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('chat-1');
      expect(result.title).toBe('My Chat');
    });

    it('updates an existing chat on conflict', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'Old Title', provider: 'claude', model: null }
      ]);

      const result = await createChat({
        id: 'chat-1',
        userId: 'user-1',
        title: 'New Title',
        provider: 'claude',
        model: 'opus'
      });

      expect(result.title).toBe('New Title');
    });
  });

  describe('getUserChats', () => {
    it('returns chats for the given user sorted by updated_at descending', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'First', updated_at: '2025-01-01T00:00:00Z' },
        { id: 'chat-2', user_id: 'user-1', title: 'Second', updated_at: '2025-01-02T00:00:00Z' },
        { id: 'chat-3', user_id: 'user-2', title: 'Other User', updated_at: '2025-01-03T00:00:00Z' }
      ]);

      const result = await getUserChats('user-1');

      expect(result).toHaveLength(2);
      // Should be sorted descending by updated_at
      expect(result[0].id).toBe('chat-2');
      expect(result[1].id).toBe('chat-1');
    });

    it('returns empty array when user has no chats', async () => {
      seedTable('chats', []);

      const result = await getUserChats('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getChat', () => {
    it('returns chat with its messages', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'Test Chat' }
      ]);
      seedTable('messages', [
        { id: 'msg-1', chat_id: 'chat-1', role: 'user', content: 'Hello', created_at: '2025-01-01T00:00:00Z' },
        { id: 'msg-2', chat_id: 'chat-1', role: 'assistant', content: 'Hi!', created_at: '2025-01-01T00:01:00Z' }
      ]);

      const result = await getChat('chat-1', 'user-1');

      expect(result.id).toBe('chat-1');
      expect(result.title).toBe('Test Chat');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].content).toBe('Hi!');
    });

    it('throws when chat is not found', async () => {
      seedTable('chats', []);

      await expect(getChat('nonexistent', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });
  });

  describe('deleteChat', () => {
    it('removes the chat from the table', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'To Delete' },
        { id: 'chat-2', user_id: 'user-1', title: 'Keep' }
      ]);

      await deleteChat('chat-1', 'user-1');

      // Verify by trying getUserChats
      const remaining = await getUserChats('user-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('chat-2');
    });
  });

  describe('updateChatTitle', () => {
    it('updates the title of the specified chat', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'Old Title' }
      ]);

      const result = await updateChatTitle('chat-1', 'user-1', 'New Title');

      expect(result.title).toBe('New Title');
    });
  });

  describe('addMessage', () => {
    it('inserts a new message', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'Test Chat', updated_at: '2025-01-01T00:00:00Z' }
      ]);
      seedTable('messages', []);

      const result = await addMessage({
        chatId: 'chat-1',
        userId: 'user-1',
        role: 'user',
        content: 'Hello world',
        html: '<p>Hello world</p>',
        metadata: { provider: 'claude' }
      });

      expect(result).toBeDefined();
      expect(result.chat_id).toBe('chat-1');
      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello world');
    });

    it('defaults html to empty string and metadata to empty object', async () => {
      seedTable('chats', [
        { id: 'chat-1', user_id: 'user-1', title: 'Test Chat', updated_at: '2025-01-01T00:00:00Z' }
      ]);
      seedTable('messages', []);

      const result = await addMessage({
        chatId: 'chat-1',
        userId: 'user-1',
        role: 'assistant',
        content: 'Hi!'
      });

      expect(result.html).toBe('');
      expect(result.metadata).toEqual({});
    });
  });

  describe('getChatMessages', () => {
    it('returns messages for a chat sorted by created_at ascending', async () => {
      seedTable('messages', [
        { id: 'msg-2', chat_id: 'chat-1', role: 'assistant', content: 'Hi!', created_at: '2025-01-01T00:01:00Z' },
        { id: 'msg-1', chat_id: 'chat-1', role: 'user', content: 'Hello', created_at: '2025-01-01T00:00:00Z' },
        { id: 'msg-3', chat_id: 'chat-2', role: 'user', content: 'Other chat', created_at: '2025-01-01T00:02:00Z' }
      ]);

      const result = await getChatMessages('chat-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
    });
  });

  describe('getProfile', () => {
    it('returns the profile for a given user', async () => {
      seedTable('profiles', [
        { id: 'user-1', display_name: 'Test User', avatar_url: null }
      ]);

      const result = await getProfile('user-1');

      expect(result.id).toBe('user-1');
      expect(result.display_name).toBe('Test User');
    });

    it('returns null when profile is not found (PGRST116)', async () => {
      seedTable('profiles', []);

      const result = await getProfile('nonexistent');

      expect(result).toBeNull();
    });

    it('rejects adding a message to a missing chat', async () => {
      seedTable('chats', []);
      seedTable('messages', []);

      await expect(
        addMessage({
          chatId: 'missing-chat',
          userId: 'user-1',
          role: 'user',
          content: 'Hello'
        })
      ).rejects.toEqual(expect.objectContaining({ code: 'PGRST116' }));
    });

    it('rejects adding a message to a chat owned by another user', async () => {
      seedTable('chats', [
        { id: 'chat-2', user_id: 'user-2', title: 'Other user chat', updated_at: '2025-01-01T00:00:00Z' }
      ]);
      seedTable('messages', []);

      await expect(
        addMessage({
          chatId: 'chat-2',
          userId: 'user-1',
          role: 'user',
          content: 'Hello'
        })
      ).rejects.toEqual(expect.objectContaining({ code: 'CHAT_FORBIDDEN' }));
    });
  });

  describe('updateProfile', () => {
    it('updates and returns the profile', async () => {
      seedTable('profiles', [
        { id: 'user-1', display_name: 'Old Name', avatar_url: null }
      ]);

      const result = await updateProfile('user-1', { display_name: 'New Name' });

      expect(result.display_name).toBe('New Name');
    });
  });
});
