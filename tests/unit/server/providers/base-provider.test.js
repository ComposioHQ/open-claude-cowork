import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the session-store dependency before importing the module under test
const mockGetProviderSession = vi.fn();
vi.mock('../../../../server/supabase/session-store.js', () => ({
  getProviderSession: mockGetProviderSession
}));

// Import module under test AFTER mocks are set up
const { BaseProvider } = await import('../../../../server/providers/base-provider.js');

describe('BaseProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BaseProvider({ apiKey: 'test-key' });
  });

  describe('constructor', () => {
    it('stores config object', () => {
      expect(provider.config).toEqual({ apiKey: 'test-key' });
    });

    it('uses empty object as default config', () => {
      const defaultProvider = new BaseProvider();
      expect(defaultProvider.config).toEqual({});
    });

    it('creates an empty sessions Map', () => {
      expect(provider.sessions).toBeInstanceOf(Map);
      expect(provider.sessions.size).toBe(0);
    });
  });

  describe('name getter', () => {
    it('throws an error requiring subclass implementation', () => {
      expect(() => provider.name).toThrow('Provider must implement name getter');
    });
  });

  describe('initialize()', () => {
    it('resolves without doing anything (no-op)', async () => {
      await expect(provider.initialize()).resolves.toBeUndefined();
    });
  });

  describe('query()', () => {
    it('throws an error requiring subclass implementation', async () => {
      const gen = provider.query({ prompt: 'hello' });
      await expect(gen.next()).rejects.toThrow('Provider must implement query method');
    });
  });

  describe('getSession()', () => {
    it('returns from memory cache first without hitting DB', async () => {
      provider.sessions.set('chat-1', 'session-abc');
      const result = await provider.getSession('chat-1');
      expect(result).toBe('session-abc');
      expect(mockGetProviderSession).not.toHaveBeenCalled();
    });

    it('falls back to DB when not in cache', async () => {
      mockGetProviderSession.mockResolvedValue('db-session-xyz');

      // Create a concrete subclass so that this.name works
      class TestProvider extends BaseProvider {
        get name() { return 'test'; }
      }
      const testProvider = new TestProvider();

      const result = await testProvider.getSession('chat-2');
      expect(result).toBe('db-session-xyz');
      expect(mockGetProviderSession).toHaveBeenCalledWith('chat-2', 'test');
    });

    it('caches the DB result in the sessions Map', async () => {
      mockGetProviderSession.mockResolvedValue('db-session-xyz');

      class TestProvider extends BaseProvider {
        get name() { return 'test'; }
      }
      const testProvider = new TestProvider();

      await testProvider.getSession('chat-2');
      expect(testProvider.sessions.get('chat-2')).toBe('db-session-xyz');
    });

    it('returns null when DB returns no session', async () => {
      mockGetProviderSession.mockResolvedValue(null);

      class TestProvider extends BaseProvider {
        get name() { return 'test'; }
      }
      const testProvider = new TestProvider();

      const result = await testProvider.getSession('chat-missing');
      expect(result).toBeNull();
    });

    it('returns null when DB throws an error', async () => {
      mockGetProviderSession.mockRejectedValue(new Error('DB connection failed'));

      class TestProvider extends BaseProvider {
        get name() { return 'test'; }
      }
      const testProvider = new TestProvider();

      const result = await testProvider.getSession('chat-err');
      expect(result).toBeNull();
      expect(mockGetProviderSession).toHaveBeenCalled();
    });
  });

  describe('setSession()', () => {
    it('stores session ID in the Map', () => {
      provider.setSession('chat-5', 'session-555');
      expect(provider.sessions.get('chat-5')).toBe('session-555');
    });

    it('overwrites existing session for the same chatId', () => {
      provider.setSession('chat-5', 'session-old');
      provider.setSession('chat-5', 'session-new');
      expect(provider.sessions.get('chat-5')).toBe('session-new');
    });
  });

  describe('abort()', () => {
    it('returns false (base implementation has no abort)', () => {
      expect(provider.abort('chat-1')).toBe(false);
    });
  });

  describe('cleanup()', () => {
    it('clears all sessions from the Map', async () => {
      provider.sessions.set('a', '1');
      provider.sessions.set('b', '2');
      expect(provider.sessions.size).toBe(2);

      await provider.cleanup();
      expect(provider.sessions.size).toBe(0);
    });
  });
});
