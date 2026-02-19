import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing modules under test
const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery
}));

const mockGetProviderSession = vi.fn();
vi.mock('../../../../server/supabase/session-store.js', () => ({
  getProviderSession: mockGetProviderSession,
  saveProviderSession: vi.fn()
}));

// Import module under test AFTER mocks
const { ClaudeProvider } = await import('../../../../server/providers/claude-provider.js');

// Helper: create an async iterable from an array of chunks
async function* mockAsyncGenerator(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// Helper: collect all yielded values from an async generator
async function collectChunks(generator) {
  const chunks = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('ClaudeProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderSession.mockResolvedValue(null);
    provider = new ClaudeProvider();
  });

  describe('constructor', () => {
    it('sets default allowed tools', () => {
      expect(provider.defaultAllowedTools).toEqual([
        'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
        'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'
      ]);
    });

    it('accepts custom allowed tools from config', () => {
      const custom = new ClaudeProvider({ allowedTools: ['Read', 'Write'] });
      expect(custom.defaultAllowedTools).toEqual(['Read', 'Write']);
    });

    it('sets default maxTurns to 20', () => {
      expect(provider.defaultMaxTurns).toBe(20);
    });

    it('sets default permissionMode to bypassPermissions', () => {
      expect(provider.permissionMode).toBe('bypassPermissions');
    });

    it('creates an empty abortControllers Map', () => {
      expect(provider.abortControllers).toBeInstanceOf(Map);
      expect(provider.abortControllers.size).toBe(0);
    });
  });

  describe('name', () => {
    it('returns "claude"', () => {
      expect(provider.name).toBe('claude');
    });
  });

  describe('query()', () => {
    it('yields session_init from system init chunk', async () => {
      const sdkChunks = [
        { type: 'system', subtype: 'init', session_id: 'sess-123' }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({
        prompt: 'hello',
        chatId: 'chat-1'
      }));

      expect(chunks).toContainEqual({
        type: 'session_init',
        session_id: 'sess-123',
        provider: 'claude'
      });
    });

    it('stores session_id via setSession when chatId is provided', async () => {
      const sdkChunks = [
        { type: 'system', subtype: 'init', session_id: 'sess-456' }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      await collectChunks(provider.query({ prompt: 'hi', chatId: 'chat-2' }));

      expect(provider.sessions.get('chat-2')).toBe('sess-456');
    });

    it('reads session_id from chunk.data.session_id fallback', async () => {
      const sdkChunks = [
        { type: 'system', subtype: 'init', data: { session_id: 'sess-from-data' } }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({
        prompt: 'hi',
        chatId: 'chat-3'
      }));

      expect(chunks).toContainEqual({
        type: 'session_init',
        session_id: 'sess-from-data',
        provider: 'claude'
      });
    });

    it('yields text chunks from assistant messages', async () => {
      const sdkChunks = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Hello world!' }
            ]
          }
        }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'hi' }));

      expect(chunks).toContainEqual(expect.objectContaining({
        type: 'text',
        content: 'Hello world!',
        provider: 'claude'
      }));
    });

    it('yields tool_use chunks from assistant messages', async () => {
      const sdkChunks = [
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: { file: 'test.js' },
                id: 'tool-1'
              }
            ]
          }
        }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'read test.js' }));

      expect(chunks).toContainEqual(expect.objectContaining({
        type: 'tool_use',
        name: 'Read',
        input: { file: 'test.js' },
        id: 'tool-1',
        provider: 'claude'
      }));
    });

    it('yields tool_result chunks', async () => {
      const sdkChunks = [
        {
          type: 'tool_result',
          result: 'file contents here',
          tool_use_id: 'tool-1'
        }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'read file' }));

      expect(chunks).toContainEqual({
        type: 'tool_result',
        result: 'file contents here',
        tool_use_id: 'tool-1',
        provider: 'claude'
      });
    });

    it('yields tool_result for "result" type chunks too', async () => {
      const sdkChunks = [
        {
          type: 'result',
          content: 'some result content',
          tool_use_id: 'tool-2'
        }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'do something' }));

      expect(chunks).toContainEqual({
        type: 'tool_result',
        result: 'some result content',
        tool_use_id: 'tool-2',
        provider: 'claude'
      });
    });

    it('yields done at the end of streaming', async () => {
      const sdkChunks = [
        { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'hello' }));

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk).toEqual({ type: 'done', provider: 'claude' });
    });

    it('passes resume option when session exists in cache', async () => {
      // Pre-populate the session cache
      provider.sessions.set('chat-resume', 'existing-session-id');

      const sdkChunks = [];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      await collectChunks(provider.query({
        prompt: 'continue',
        chatId: 'chat-resume'
      }));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'continue',
          options: expect.objectContaining({
            resume: 'existing-session-id'
          })
        })
      );
    });

    it('does NOT pass resume when no session exists', async () => {
      const sdkChunks = [];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      await collectChunks(provider.query({
        prompt: 'first message',
        chatId: 'new-chat'
      }));

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.resume).toBeUndefined();
    });

    it('passes through non-system chunks with provider name', async () => {
      const sdkChunks = [
        { type: 'custom_event', data: 'something' }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'hi' }));

      expect(chunks).toContainEqual({
        type: 'custom_event',
        data: 'something',
        provider: 'claude'
      });
    });

    it('skips system chunks that are not init', async () => {
      const sdkChunks = [
        { type: 'system', subtype: 'heartbeat' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }
      ];
      mockQuery.mockReturnValue(mockAsyncGenerator(sdkChunks));

      const chunks = await collectChunks(provider.query({ prompt: 'hi' }));

      const systemChunks = chunks.filter(c => c.type === 'system' || c.subtype === 'heartbeat');
      expect(systemChunks).toHaveLength(0);
    });

    it('cleans up abort controller after query completes', async () => {
      mockQuery.mockReturnValue(mockAsyncGenerator([]));

      await collectChunks(provider.query({ prompt: 'hi', chatId: 'chat-cleanup' }));

      expect(provider.abortControllers.has('chat-cleanup')).toBe(false);
    });

    it('passes mcpServers to the SDK query call', async () => {
      const mcpServers = { composio: { url: 'http://localhost:5000' } };
      mockQuery.mockReturnValue(mockAsyncGenerator([]));

      await collectChunks(provider.query({
        prompt: 'hi',
        chatId: 'chat-mcp',
        mcpServers
      }));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            mcpServers
          })
        })
      );
    });
  });

  describe('abort()', () => {
    it('returns true and signals abort when an active controller exists', async () => {
      // Start a query that will hang (never resolves) so abort controller is registered
      const neverEndingChunks = async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'sess-abort' };
        // Simulate waiting indefinitely
        await new Promise(() => {});
      };
      mockQuery.mockReturnValue(neverEndingChunks());

      // Start consuming the generator (don't await, it will hang)
      const gen = provider.query({ prompt: 'long task', chatId: 'chat-abort' });
      // Advance past the first chunk so the abort controller is registered
      await gen.next();

      expect(provider.abortControllers.has('chat-abort')).toBe(true);
      const result = provider.abort('chat-abort');
      expect(result).toBe(true);
      expect(provider.abortControllers.has('chat-abort')).toBe(false);
    });

    it('returns false when no active query for the chatId', () => {
      expect(provider.abort('nonexistent-chat')).toBe(false);
    });

    it('yields aborted chunk when AbortError is thrown', async () => {
      // Create an async generator that throws AbortError when signal is triggered
      const abortableChunks = async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'sess-abort2' };

        // Simulate the SDK checking the abort signal
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        throw abortError;
      };
      mockQuery.mockReturnValue(abortableChunks());

      const chunks = await collectChunks(provider.query({
        prompt: 'will abort',
        chatId: 'chat-abort2'
      }));

      expect(chunks).toContainEqual({
        type: 'aborted',
        provider: 'claude'
      });
    });

    it('rethrows non-AbortError errors', async () => {
      const errorChunks = async function* () {
        throw new Error('Network failure');
      };
      mockQuery.mockReturnValue(errorChunks());

      const gen = provider.query({ prompt: 'fail', chatId: 'chat-err' });

      await expect(collectChunks(gen)).rejects.toThrow('Network failure');
    });
  });

  describe('cleanup', () => {
    it('inherits cleanup from BaseProvider (clears sessions)', async () => {
      provider.sessions.set('a', '1');
      await provider.cleanup();
      expect(provider.sessions.size).toBe(0);
    });
  });
});
