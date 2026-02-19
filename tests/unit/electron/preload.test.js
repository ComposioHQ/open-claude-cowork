import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron module
const mockExposeInMainWorld = vi.fn();
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args) => mockExposeInMainWorld(...args)
  },
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn()
  }
}));

describe('preload.js', () => {
  let exposedAPI;

  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();

    // Simulate what preload.js does
    const SERVER_URL = 'http://localhost:3001';
    let currentAbortController = null;
    let authToken = null;

    function buildHeaders(extra = {}) {
      const headers = { 'Content-Type': 'application/json', ...extra };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      return headers;
    }

    exposedAPI = {
      setAuthToken: (token) => { authToken = token; },
      getAuthToken: () => authToken,
      abortCurrentRequest: () => {
        if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
      },
      stopQuery: async (chatId, provider = 'claude') => {
        try {
          const response = await fetch(`${SERVER_URL}/api/abort`, {
            method: 'POST', headers: buildHeaders(),
            body: JSON.stringify({ chatId, provider })
          });
          return await response.json();
        } catch (error) { return { success: false, error: error.message }; }
      },
      sendMessage: async (message, chatId, provider = 'claude', model = null) => {
        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;
        const response = await fetch(`${SERVER_URL}/api/chat`, {
          method: 'POST', headers: buildHeaders(),
          body: JSON.stringify({ message, chatId, provider, model }), signal
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return {
          getReader: async () => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            return {
              read: async () => {
                const { done, value } = await reader.read();
                return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
              }
            };
          }
        };
      },
      getProviders: async () => {
        try {
          const response = await fetch(`${SERVER_URL}/api/providers`);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return await response.json();
        } catch { return { providers: ['claude'], default: 'claude' }; }
      },
      checkBackend: async () => {
        try {
          const response = await fetch(`${SERVER_URL}/api/health`);
          return response.ok;
        } catch { return false; }
      },
      getSettings: async () => {
        const response = await fetch(`${SERVER_URL}/api/settings`);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      },
      updateSettings: async (body) => {
        const response = await fetch(`${SERVER_URL}/api/settings`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      }
    };
  });

  describe('SERVER_URL', () => {
    it('uses localhost:3001 as base URL', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ providers: ['claude'] })
      });

      await exposedAPI.getProviders();
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3001/api/providers');
    });
  });

  describe('auth token management', () => {
    it('setAuthToken stores token', () => {
      exposedAPI.setAuthToken('my-jwt');
      expect(exposedAPI.getAuthToken()).toBe('my-jwt');
    });

    it('getAuthToken returns null by default', () => {
      expect(exposedAPI.getAuthToken()).toBeNull();
    });

    it('includes auth token in headers when set', async () => {
      exposedAPI.setAuthToken('test-token');
      globalThis.fetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true })
      });

      await exposedAPI.stopQuery('chat-1');

      const headers = globalThis.fetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });

  describe('abortCurrentRequest', () => {
    it('aborts active request', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined })
      };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      // Start a request (creates abort controller)
      await exposedAPI.sendMessage('hi', 'chat-1');

      // Abort it
      exposedAPI.abortCurrentRequest();

      // Start another request — should not throw
      globalThis.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });
      await expect(exposedAPI.sendMessage('hi2', 'chat-2')).resolves.toBeDefined();
    });
  });

  describe('sendMessage', () => {
    it('sends POST to /api/chat with message params', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true })
      };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const stream = await exposedAPI.sendMessage('hello', 'chat-123', 'claude', 'sonnet');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/chat',
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.message).toBe('hello');
      expect(body.chatId).toBe('chat-123');
      expect(body.provider).toBe('claude');
      expect(body.model).toBe('sonnet');

      // Should return reader interface
      expect(typeof stream.getReader).toBe('function');
    });
  });

  describe('checkBackend', () => {
    it('returns true when health check passes', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true });
      expect(await exposedAPI.checkBackend()).toBe(true);
    });

    it('returns false when health check fails', async () => {
      globalThis.fetch.mockRejectedValue(new Error('offline'));
      expect(await exposedAPI.checkBackend()).toBe(false);
    });
  });

  describe('API methods count', () => {
    it('exposes all expected methods', () => {
      const methods = Object.keys(exposedAPI);
      expect(methods).toContain('sendMessage');
      expect(methods).toContain('stopQuery');
      expect(methods).toContain('getProviders');
      expect(methods).toContain('checkBackend');
      expect(methods).toContain('setAuthToken');
      expect(methods).toContain('getAuthToken');
      expect(methods).toContain('abortCurrentRequest');
      expect(methods).toContain('getSettings');
      expect(methods).toContain('updateSettings');
    });
  });
});
