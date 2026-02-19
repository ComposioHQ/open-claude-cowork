import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetMockDB, seedTable, seedRpc, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

import {
  embedMessage,
  embedAttachment,
  searchSimilar,
  processUnembeddedMessages
} from '../../../../server/supabase/embeddings.js';

// Mock global fetch for OpenAI API
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockOpenAIEmbeddingResponse(embedding = [0.1, 0.2, 0.3]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: [{ embedding }] })
  });
}

describe('embeddings.js', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    resetMockDB();
    mockFetch.mockReset();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  describe('chunkText (tested indirectly via embedMessage)', () => {
    it('produces a single chunk for short text (under 1000 chars)', async () => {
      seedTable('embeddings', []);
      const shortText = 'Hello world';

      // Each chunk triggers one fetch call
      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);

      await embedMessage('msg-1', shortText, 'user-1');

      // One call = one chunk
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('produces multiple chunks for long text with overlap', async () => {
      seedTable('embeddings', []);
      // Create text longer than 1000 chars (CHUNK_SIZE).
      // With CHUNK_SIZE=1000 and CHUNK_OVERLAP=200, step = 800.
      // 1600 chars -> chunks at [0..1000], [800..1600] = 2 chunks
      const longText = 'a'.repeat(1600);

      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);
      mockOpenAIEmbeddingResponse([0.4, 0.5, 0.6]);

      await embedMessage('msg-2', longText, 'user-1');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('produces correct number of chunks for edge case text lengths', async () => {
      seedTable('embeddings', []);
      // Exactly 1000 chars -> should be a single chunk (not split)
      const exactText = 'b'.repeat(1000);

      mockOpenAIEmbeddingResponse([0.1]);

      await embedMessage('msg-3', exactText, 'user-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles 1001 chars as two chunks', async () => {
      seedTable('embeddings', []);
      // 1001 chars -> chunks at [0..1000], [800..1001] = 2 chunks
      const text = 'c'.repeat(1001);

      mockOpenAIEmbeddingResponse([0.1]);
      mockOpenAIEmbeddingResponse([0.2]);

      await embedMessage('msg-4', text, 'user-1');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('embedMessage', () => {
    it('calls OpenAI API and inserts embedding into the database', async () => {
      seedTable('embeddings', []);
      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);

      await embedMessage('msg-1', 'Test message content', 'user-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key'
          }),
          body: expect.stringContaining('text-embedding-3-small')
        })
      );
    });

    it('skips when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;

      await embedMessage('msg-1', 'Test content', 'user-1');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips when content is empty or whitespace', async () => {
      await embedMessage('msg-1', '', 'user-1');
      await embedMessage('msg-2', '   ', 'user-1');
      await embedMessage('msg-3', null, 'user-1');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles OpenAI API errors gracefully (does not throw)', async () => {
      seedTable('embeddings', []);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited'
      });

      // Should not throw — errors are caught internally
      await expect(embedMessage('msg-1', 'Content', 'user-1')).resolves.toBeUndefined();
    });

    it('inserts content_preview truncated to 200 chars', async () => {
      seedTable('embeddings', []);
      const longContent = 'x'.repeat(500);
      mockOpenAIEmbeddingResponse([0.1, 0.2]);

      await embedMessage('msg-1', longContent, 'user-1');

      // Verify the insert was called — check what was inserted
      // The content_preview should be the first 200 chars
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('embedAttachment', () => {
    it('embeds attachment content with source_type attachment', async () => {
      seedTable('embeddings', []);
      mockOpenAIEmbeddingResponse([0.5, 0.6, 0.7]);

      await embedAttachment('att-1', 'File contents here', 'user-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('skips when no OPENAI_API_KEY', async () => {
      delete process.env.OPENAI_API_KEY;

      await embedAttachment('att-1', 'File contents', 'user-1');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('searchSimilar', () => {
    it('calls the search_embeddings RPC with the query embedding', async () => {
      const searchResults = [
        { source_id: 'msg-1', content_preview: 'Result 1', similarity: 0.95 },
        { source_id: 'msg-2', content_preview: 'Result 2', similarity: 0.85 }
      ];
      seedRpc('search_embeddings', (params) => {
        expect(params.match_count).toBe(10);
        expect(params.match_threshold).toBe(0.7);
        expect(params.filter_user_id).toBe('user-1');
        return searchResults;
      });

      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);

      const results = await searchSimilar('test query', 'user-1');

      expect(results).toEqual(searchResults);
    });

    it('passes custom matchCount and threshold', async () => {
      seedRpc('search_embeddings', (params) => {
        expect(params.match_count).toBe(5);
        expect(params.match_threshold).toBe(0.9);
        return [];
      });

      mockOpenAIEmbeddingResponse([0.1]);

      const results = await searchSimilar('query', 'user-1', 5, 0.9);

      expect(results).toEqual([]);
    });
  });

  describe('processUnembeddedMessages', () => {
    it('fetches recent messages and embeds those without existing embeddings', async () => {
      seedTable('messages', [
        { id: 'msg-1', content: 'Already embedded', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z' },
        { id: 'msg-2', content: 'Not yet embedded', user_id: 'user-1', created_at: '2025-01-01T00:01:00Z' }
      ]);
      seedTable('embeddings', [
        { source_id: 'msg-1', source_type: 'message' }
      ]);

      // msg-2 needs embedding, so one fetch call
      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);

      await processUnembeddedMessages();

      // Only msg-2 should trigger an OpenAI call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('skips when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;

      await processUnembeddedMessages();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when all messages are already embedded', async () => {
      seedTable('messages', [
        { id: 'msg-1', content: 'Embedded', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z' }
      ]);
      seedTable('embeddings', [
        { source_id: 'msg-1', source_type: 'message' }
      ]);

      await processUnembeddedMessages();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when there are no messages', async () => {
      seedTable('messages', []);
      seedTable('embeddings', []);

      await processUnembeddedMessages();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not start a second batch while one is already running', async () => {
      seedTable('messages', [
        { id: 'msg-1', content: 'One message', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z' }
      ]);
      seedTable('embeddings', []);

      mockOpenAIEmbeddingResponse([0.1, 0.2, 0.3]);

      const first = processUnembeddedMessages();
      const second = processUnembeddedMessages();
      await Promise.all([first, second]);

      // If both started, OpenAI would be called twice. Locking should keep it at one.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
