import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
let mockSupabaseClient;

beforeEach(() => {
  vi.resetAllMocks();

  mockSupabaseClient = {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn()
    }
  };

  globalThis.fetch = mockFetch;
  globalThis.window = {
    _apiBase: '',
    _authToken: null,
    supabase: {
      createClient: vi.fn(() => mockSupabaseClient)
    },
    electronAPI: {
      setAuthToken: vi.fn()
    }
  };
});

function createAuthModule() {
  let supabaseClient = null;
  let currentSession = null;

  async function initAuth(onReady) {
    try {
      const base = globalThis.window._apiBase || '';
      const res = await fetch(base + '/api/config');
      const config = await res.json();

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        if (onReady) onReady(null, { skipped: true });
        return;
      }

      supabaseClient = globalThis.window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentSession = session;
        globalThis.window._authToken = session?.access_token || null;
        if (globalThis.window.electronAPI?.setAuthToken) {
          globalThis.window.electronAPI.setAuthToken(session?.access_token || null);
        }
      });

      const { data: { session } } = await supabaseClient.auth.getSession();
      currentSession = session;
      globalThis.window._authToken = session?.access_token || null;

      if (onReady) onReady(session);
    } catch (err) {
      if (onReady) onReady(null);
    }
  }

  async function signUp(email, password, displayName) {
    if (!supabaseClient) throw new Error('Auth not initialized');
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { display_name: displayName || email.split('@')[0] } }
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    if (!supabaseClient) throw new Error('Auth not initialized');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentSession = null;
    globalThis.window._authToken = null;
  }

  function getAuthToken() {
    return currentSession?.access_token || globalThis.window._authToken || null;
  }

  function isAuthenticated() {
    return !!currentSession;
  }

  return { initAuth, signUp, signIn, signOut, getAuthToken, isAuthenticated };
}

describe('auth.js', () => {
  describe('initAuth', () => {
    it('fetches /api/config and initializes Supabase client', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' })
      });

      const auth = createAuthModule();
      const onReady = vi.fn();

      await auth.initAuth(onReady);

      expect(mockFetch).toHaveBeenCalledWith('/api/config');
      expect(globalThis.window.supabase.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-anon-key');
      expect(onReady).toHaveBeenCalledWith(null); // no existing session
    });

    it('skips when Supabase not configured', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: '', supabaseAnonKey: '' })
      });

      const auth = createAuthModule();
      const onReady = vi.fn();

      await auth.initAuth(onReady);

      expect(onReady).toHaveBeenCalledWith(null, { skipped: true });
    });

    it('calls onReady with session when existing session found', async () => {
      const mockSession = { access_token: 'token-123', user: { id: 'u1' } };
      mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockSession } });

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'key' })
      });

      const auth = createAuthModule();
      const onReady = vi.fn();

      await auth.initAuth(onReady);

      expect(onReady).toHaveBeenCalledWith(mockSession);
      expect(globalThis.window._authToken).toBe('token-123');
    });
  });

  describe('signIn', () => {
    it('throws when not initialized', async () => {
      const auth = createAuthModule();
      await expect(auth.signIn('a@b.com', 'pass')).rejects.toThrow('Auth not initialized');
    });

    it('signs in successfully', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' })
      });
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'at' } }, error: null
      });

      const auth = createAuthModule();
      await auth.initAuth();
      const data = await auth.signIn('a@b.com', 'pass');
      expect(data.session.access_token).toBe('at');
    });

    it('throws on auth error', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' })
      });
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: null, error: { message: 'Invalid credentials' }
      });

      const auth = createAuthModule();
      await auth.initAuth();
      await expect(auth.signIn('a@b.com', 'wrong')).rejects.toEqual({ message: 'Invalid credentials' });
    });
  });

  describe('signUp', () => {
    it('signs up with display name', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' })
      });
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: { id: 'new-user' } }, error: null
      });

      const auth = createAuthModule();
      await auth.initAuth();
      const data = await auth.signUp('a@b.com', 'pass', 'TestUser');

      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith({
        email: 'a@b.com', password: 'pass',
        options: { data: { display_name: 'TestUser' } }
      });
      expect(data.user.id).toBe('new-user');
    });
  });

  describe('signOut', () => {
    it('clears session and token', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' })
      });
      mockSupabaseClient.auth.signOut.mockResolvedValue({});

      const auth = createAuthModule();
      await auth.initAuth();
      globalThis.window._authToken = 'some-token';

      await auth.signOut();
      expect(globalThis.window._authToken).toBeNull();
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthToken', () => {
    it('returns null when no session', () => {
      const auth = createAuthModule();
      expect(auth.getAuthToken()).toBeNull();
    });
  });
});
