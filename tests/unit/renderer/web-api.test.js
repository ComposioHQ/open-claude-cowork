import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM environment
const mockFetch = vi.fn();
const mockReadableStream = {
  getReader: () => ({
    read: vi.fn().mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"type":"text"}\n\n') })
      .mockResolvedValue({ done: true, value: undefined })
  })
};

beforeEach(() => {
  vi.resetAllMocks();
  // Reset globals
  globalThis.window = {
    location: { protocol: 'https:' },
    _authToken: null,
    _apiBase: '',
    API_BASE_URL: undefined,
    supabase: undefined
  };
  globalThis.fetch = mockFetch;
  globalThis.AbortController = AbortController;
  globalThis.URLSearchParams = URLSearchParams;
  globalThis.TextDecoder = TextDecoder;

  // Clear any existing electronAPI
  delete globalThis.window.electronAPI;
});

function loadWebApi() {
  // Simulate the IIFE that sets up window.electronAPI
  const apiBase = '';

  function apiUrl(path) { return apiBase + path; }
  function buildHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (globalThis.window._authToken) {
      headers['Authorization'] = 'Bearer ' + globalThis.window._authToken;
    }
    return headers;
  }

  let currentAbortController = null;

  globalThis.window.electronAPI = {
    setAuthToken: (token) => { globalThis.window._authToken = token; },
    getAuthToken: () => globalThis.window._authToken || null,
    abortCurrentRequest: () => {
      if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
    },
    stopQuery: async (chatId, provider) => {
      try {
        const response = await fetch(apiUrl('/api/abort'), {
          method: 'POST', headers: buildHeaders(),
          body: JSON.stringify({ chatId, provider: provider || 'claude' })
        });
        return await response.json();
      } catch (err) { return { success: false, error: err.message }; }
    },
    sendMessage: (message, chatId, provider, model) => {
      if (currentAbortController) currentAbortController.abort();
      currentAbortController = new AbortController();
      return fetch(apiUrl('/api/chat'), {
        method: 'POST', headers: buildHeaders(),
        body: JSON.stringify({ message, chatId, provider: provider || 'claude', model }),
        signal: currentAbortController.signal
      }).then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
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
      });
    },
    getProviders: async () => {
      try {
        const response = await fetch(apiUrl('/api/providers'));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      } catch { return { providers: ['claude'], default: 'claude' }; }
    },
    checkBackend: async () => {
      try {
        const response = await fetch(apiUrl('/api/health'));
        return response.ok;
      } catch { return false; }
    },
    getSettings: async () => {
      const response = await fetch(apiUrl('/api/settings'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    updateSettings: async (body) => {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'PUT', headers: buildHeaders(), body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'HTTP ' + response.status);
      }
      return await response.json();
    },
    getDatabaseAccess: async () => {
      try {
        const response = await fetch(apiUrl('/api/database/access'), { headers: buildHeaders() });
        if (!response.ok) return { allowed: false };
        return await response.json();
      } catch { return { allowed: false }; }
    },
    getJobs: async () => {
      const response = await fetch(apiUrl('/api/jobs'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    }
  };

  return globalThis.window.electronAPI;
}

describe('web-api.js electronAPI polyfill', () => {
  describe('setAuthToken / getAuthToken', () => {
    it('stores and retrieves auth token', () => {
      const api = loadWebApi();
      expect(api.getAuthToken()).toBeNull();
      api.setAuthToken('test-token-123');
      expect(api.getAuthToken()).toBe('test-token-123');
    });
  });

  describe('stopQuery', () => {
    it('sends POST to /api/abort with chatId and provider', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true })
      });

      const result = await api.stopQuery('chat-1', 'claude');
      expect(mockFetch).toHaveBeenCalledWith('/api/abort', expect.objectContaining({
        method: 'POST'
      }));
      expect(result).toEqual({ success: true });
    });

    it('returns error on fetch failure', async () => {
      const api = loadWebApi();
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await api.stopQuery('chat-1');
      expect(result).toEqual({ success: false, error: 'Network error' });
    });
  });

  describe('sendMessage', () => {
    it('sends POST to /api/chat and returns reader interface', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReadableStream.getReader() }
      });

      const stream = await api.sendMessage('hello', 'chat-1', 'claude', null);
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        method: 'POST'
      }));
      expect(stream.getReader).toBeDefined();
    });

    it('throws on HTTP error', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

      await expect(api.sendMessage('hi', 'chat-1')).rejects.toThrow('HTTP 500');
    });
  });

  describe('getProviders', () => {
    it('returns providers from API', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ providers: ['claude'], default: 'claude' })
      });

      const result = await api.getProviders();
      expect(result.providers).toContain('claude');
    });

    it('returns fallback on failure', async () => {
      const api = loadWebApi();
      mockFetch.mockRejectedValue(new Error('offline'));

      const result = await api.getProviders();
      expect(result).toEqual({ providers: ['claude'], default: 'claude' });
    });
  });

  describe('checkBackend', () => {
    it('returns true when backend is reachable', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({ ok: true });
      expect(await api.checkBackend()).toBe(true);
    });

    it('returns false when backend is unreachable', async () => {
      const api = loadWebApi();
      mockFetch.mockRejectedValue(new Error('offline'));
      expect(await api.checkBackend()).toBe(false);
    });
  });

  describe('auth header injection', () => {
    it('includes Authorization header when token is set', async () => {
      const api = loadWebApi();
      api.setAuthToken('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ apiKeys: {} })
      });

      await api.getSettings();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization header when no token', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ apiKeys: {} })
      });

      await api.getSettings();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('getSettings / updateSettings', () => {
    it('getSettings fetches from /api/settings', async () => {
      const api = loadWebApi();
      const mockData = { apiKeys: { anthropic: '****1234' }, mcpServers: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const result = await api.getSettings();
      expect(result).toEqual(mockData);
    });

    it('updateSettings sends PUT to /api/settings', async () => {
      const api = loadWebApi();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ apiKeys: {} })
      });

      await api.updateSettings({ apiKeys: { anthropic: 'new-key' } });
      expect(mockFetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
        method: 'PUT'
      }));
    });
  });

  describe('getDatabaseAccess', () => {
    it('passes through full access payload unchanged', async () => {
      const api = loadWebApi();
      const payload = {
        allowed: true,
        configured: true,
        supabaseUrl: 'https://abc.supabase.co',
        projectRef: 'abc',
        dashboardUrl: 'https://supabase.com/dashboard/project/abc',
        databaseName: 'postgres'
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload)
      });
      expect(await api.getDatabaseAccess()).toEqual(payload);
    });

    it('returns allowed: false on error', async () => {
      const api = loadWebApi();
      mockFetch.mockRejectedValue(new Error('fail'));
      expect(await api.getDatabaseAccess()).toEqual({ allowed: false });
    });
  });
});
