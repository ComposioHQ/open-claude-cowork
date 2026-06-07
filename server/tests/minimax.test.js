import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxProvider } from '../providers/minimax-provider.js';

describe('MiniMaxProvider', () => {
  const validConfig = { apiKey: 'test-key' };

  beforeEach(() => {
    delete process.env.MINIMAX_API_KEY;
  });

  describe('constructor', () => {
    it('creates instance with valid config', () => {
      const provider = new MiniMaxProvider(validConfig);
      expect(provider).toBeDefined();
    });

    it('uses apiKey from config', () => {
      const provider = new MiniMaxProvider({ apiKey: 'my-key' });
      expect(provider.apiKey).toBe('my-key');
    });

    it('falls back to MINIMAX_API_KEY env variable', () => {
      process.env.MINIMAX_API_KEY = 'env-key';
      const provider = new MiniMaxProvider();
      expect(provider.apiKey).toBe('env-key');
    });

    it('uses default baseURL', () => {
      const provider = new MiniMaxProvider(validConfig);
      expect(provider.baseURL).toBe('https://api.minimax.io/v1');
    });

    it('allows custom baseURL', () => {
      const provider = new MiniMaxProvider({ apiKey: 'key', baseURL: 'https://custom.api.io/v1' });
      expect(provider.baseURL).toBe('https://custom.api.io/v1');
    });

    it('defaults to MiniMax-M3 model', () => {
      const provider = new MiniMaxProvider(validConfig);
      expect(provider.defaultModel).toBe('MiniMax-M3');
    });

    it('allows custom default model', () => {
      const provider = new MiniMaxProvider({ apiKey: 'key', model: 'MiniMax-M2.7-highspeed' });
      expect(provider.defaultModel).toBe('MiniMax-M2.7-highspeed');
    });
  });

  describe('name', () => {
    it('returns "minimax"', () => {
      const provider = new MiniMaxProvider(validConfig);
      expect(provider.name).toBe('minimax');
    });
  });

  describe('query', () => {
    it('yields error when API key is missing', async () => {
      const provider = new MiniMaxProvider(); // no apiKey
      const chunks = [];
      for await (const chunk of provider.query({ prompt: 'hello', chatId: 'test' })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].message).toContain('MINIMAX_API_KEY');
    });

    it('sends request to correct endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n')
              })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      const chunks = [];
      for await (const chunk of provider.query({ prompt: 'hi', chatId: 'chat1' })) {
        chunks.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.minimax.io/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
            'Content-Type': 'application/json',
          })
        })
      );

      vi.unstubAllGlobals();
    });

    it('sends temperature as 1.0', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      for await (const _ of provider.query({ prompt: 'hi', chatId: 'chat1' })) {
        // consume
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(1.0);

      vi.unstubAllGlobals();
    });

    it('uses MiniMax-M3 as default model', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      for await (const _ of provider.query({ prompt: 'hi', chatId: 'chat1' })) {
        // consume
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('MiniMax-M3');

      vi.unstubAllGlobals();
    });

    it('yields text chunks from streaming response', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseData) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      const chunks = [];
      for await (const chunk of provider.query({ prompt: 'hi', chatId: 'chat1' })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0].content).toBe('Hello');
      expect(textChunks[1].content).toBe(' world');
      expect(textChunks[0].provider).toBe('minimax');

      const doneChunk = chunks.find(c => c.type === 'done');
      expect(doneChunk).toBeDefined();

      vi.unstubAllGlobals();
    });

    it('yields error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      const chunks = [];
      for await (const chunk of provider.query({ prompt: 'hi', chatId: 'chat1' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
      expect(chunks[0].message).toContain('401');

      vi.unstubAllGlobals();
    });

    it('maintains conversation history for multi-turn', async () => {
      const callBodies = [];
      const mockFetch = vi.fn().mockImplementation((url, opts) => {
        callBodies.push(JSON.parse(opts.body));
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(
                    `data: {"choices":[{"delta":{"content":"Response"}}]}\n\ndata: [DONE]\n\n`
                  )
                })
                .mockResolvedValueOnce({ done: true })
            })
          }
        });
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new MiniMaxProvider(validConfig);
      const chatId = 'multi-turn-chat';

      // First turn
      for await (const _ of provider.query({ prompt: 'First message', chatId })) {}

      // Second turn
      for await (const _ of provider.query({ prompt: 'Second message', chatId })) {}

      // Second call should include full history
      const secondCallMessages = callBodies[1].messages;
      expect(secondCallMessages).toHaveLength(3); // user, assistant, user
      expect(secondCallMessages[0]).toEqual({ role: 'user', content: 'First message' });
      expect(secondCallMessages[1]).toEqual({ role: 'assistant', content: 'Response' });
      expect(secondCallMessages[2]).toEqual({ role: 'user', content: 'Second message' });

      vi.unstubAllGlobals();
    });
  });

  describe('abort', () => {
    it('returns false when no active query', () => {
      const provider = new MiniMaxProvider(validConfig);
      expect(provider.abort('nonexistent-chat')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('clears conversations and abort controllers', async () => {
      const provider = new MiniMaxProvider(validConfig);
      provider.conversations.set('test', []);
      await provider.cleanup();
      expect(provider.conversations.size).toBe(0);
    });
  });
});

describe('MiniMax parameter filtering', () => {
  it('does not send response_format (unsupported by MiniMax)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
            .mockResolvedValueOnce({ done: true })
        })
      }
    });

    vi.stubGlobal('fetch', mockFetch);

    const provider = new MiniMaxProvider({ apiKey: 'key' });
    for await (const _ of provider.query({ prompt: 'test', chatId: 'c1' })) {}

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('response_format');

    vi.unstubAllGlobals();
  });

  it('temperature is always 1.0 (not 0)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n\n') })
            .mockResolvedValueOnce({ done: true })
        })
      }
    });

    vi.stubGlobal('fetch', mockFetch);

    const provider = new MiniMaxProvider({ apiKey: 'key' });
    for await (const _ of provider.query({ prompt: 'test', chatId: 'c1' })) {}

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBeGreaterThan(0);
    expect(body.temperature).toBeLessThanOrEqual(1.0);

    vi.unstubAllGlobals();
  });
});

describe('MiniMax base URL', () => {
  it('uses overseas API endpoint by default', () => {
    const provider = new MiniMaxProvider({ apiKey: 'key' });
    expect(provider.baseURL).toContain('api.minimax.io');
  });

  it('does not use api.minimax.chat (domestic-only endpoint)', () => {
    const provider = new MiniMaxProvider({ apiKey: 'key' });
    expect(provider.baseURL).not.toContain('api.minimax.chat');
  });
});
