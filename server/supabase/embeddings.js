import { getAdminClient } from './client.js';

const db = () => getAdminClient();

const getOpenAIKey = () => process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_FETCH_TIMEOUT_MS = 15_000;
const EMBEDDING_FETCH_RETRIES = 3;
let processingUnembeddedMessages = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
  let attempt = 0;
  let lastErr;

  while (attempt < EMBEDDING_FETCH_RETRIES) {
    attempt += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.text();
        if (response.status >= 500 && attempt < EMBEDDING_FETCH_RETRIES) {
          lastErr = new Error(`OpenAI embeddings error: ${response.status} ${err}`);
          await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
          continue;
        }
        throw new Error(`OpenAI embeddings error: ${response.status} ${err}`);
      }

      return response;
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        lastErr = new Error('OpenAI embeddings request timed out');
      }
      if (attempt >= EMBEDDING_FETCH_RETRIES) break;
      await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr || new Error('OpenAI embeddings request failed');
}

// Generate embedding via OpenAI API
async function getEmbedding(text) {
  if (!getOpenAIKey()) throw new Error('getOpenAIKey() not set');

  const response = await fetchWithRetry('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenAIKey()}`
    },
    body: JSON.stringify({ input: text.substring(0, 8000), model: EMBEDDING_MODEL })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Chunk text for long documents
function chunkText(text) {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.substring(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// Embed a message
export async function embedMessage(messageId, content, userId) {
  if (!getOpenAIKey() || !content?.trim()) return;

  try {
    const chunks = chunkText(content);
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      await db()
        .from('embeddings')
        .insert({
          user_id: userId,
          source_type: 'message',
          source_id: messageId,
          content_preview: chunk.substring(0, 200),
          embedding
        });
    }
  } catch (err) {
    console.error('[EMBED] Error embedding message:', err.message);
  }
}

// Embed an attachment (text content)
export async function embedAttachment(attachmentId, content, userId) {
  if (!getOpenAIKey() || !content?.trim()) return;

  try {
    const chunks = chunkText(content);
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      await db()
        .from('embeddings')
        .insert({
          user_id: userId,
          source_type: 'attachment',
          source_id: attachmentId,
          content_preview: chunk.substring(0, 200),
          embedding
        });
    }
  } catch (err) {
    console.error('[EMBED] Error embedding attachment:', err.message);
  }
}

// Semantic search
export async function searchSimilar(queryText, userId, matchCount = 10, threshold = 0.7) {
  const queryEmbedding = await getEmbedding(queryText);

  const { data, error } = await db().rpc('search_embeddings', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: threshold,
    filter_user_id: userId
  });

  if (error) throw error;
  return data;
}

// Process unembedded messages (batch job)
export async function processUnembeddedMessages() {
  if (!getOpenAIKey()) return;
  if (processingUnembeddedMessages) {
    return;
  }

  processingUnembeddedMessages = true;

  try {
    // Find messages that don't have embeddings yet
    const { data: messages, error } = await db()
      .from('messages')
      .select('id, content, user_id')
      .not('content', 'eq', '')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!messages?.length) return;

    // Check which ones already have embeddings
    const messageIds = messages.map(m => m.id);
    const { data: existing } = await db()
      .from('embeddings')
      .select('source_id')
      .eq('source_type', 'message')
      .in('source_id', messageIds);

    const existingIds = new Set((existing || []).map(e => e.source_id));
    const toEmbed = messages.filter(m => !existingIds.has(m.id));

    console.log(`[EMBED] Processing ${toEmbed.length} unembedded messages`);

    for (const msg of toEmbed) {
      const { data: alreadyEmbedded, error: existsError } = await db()
        .from('embeddings')
        .select('id')
        .eq('source_type', 'message')
        .eq('source_id', msg.id)
        .limit(1);

      if (existsError) {
        console.error('[EMBED] Failed to check existing embedding:', existsError.message);
        continue;
      }
      if (alreadyEmbedded?.length > 0) continue;

      await embedMessage(msg.id, msg.content, msg.user_id);
    }
  } catch (err) {
    console.error('[EMBED] Batch processing error:', err.message);
  } finally {
    processingUnembeddedMessages = false;
  }
}
