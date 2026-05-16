import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { Composio } from '@composio/core';
import { getProvider, getAvailableProviders, initializeProviders } from './providers/index.js';
import {
  createMessage,
  getUnreadCount,
  listMessages,
  markRead
} from './session-bus.js';
import {
  completeHandoff,
  createHandoff,
  listHandoffs
} from './codex-handoff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Composio lazily. Cowork core UI/session bus should boot even
// when COMPOSIO_API_KEY is not configured; Composio tools are optional.
const composio = process.env.COMPOSIO_API_KEY ? new Composio() : null;

const composioSessions = new Map();
let defaultComposioSession = null;

// Pre-initialize Composio session on startup
async function initializeComposioSession() {
  if (!composio) {
    console.warn('[COMPOSIO] COMPOSIO_API_KEY not configured; starting without Composio MCP tools');
    return;
  }

  const defaultUserId = 'default-user';
  console.log('[COMPOSIO] Pre-initializing session for:', defaultUserId);
  try {
    defaultComposioSession = await composio.create(defaultUserId);
    composioSessions.set(defaultUserId, defaultComposioSession);
    console.log('[COMPOSIO] Session ready with MCP URL:', defaultComposioSession.mcp.url);

    // Update opencode.json with the MCP config
    updateOpencodeConfig(defaultComposioSession.mcp.url, defaultComposioSession.mcp.headers);
    console.log('[OPENCODE] Updated opencode.json with MCP config');
  } catch (error) {
    console.error('[COMPOSIO] Failed to pre-initialize session:', error.message);
  }
}

// Write MCP config to opencode.json
function updateOpencodeConfig(mcpUrl, mcpHeaders) {
  const opencodeConfigPath = path.join(__dirname, 'opencode.json');
  const config = {
    mcp: {
      composio: {
        type: 'remote',
        url: mcpUrl,
        headers: mcpHeaders
      }
    }
  };
  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2));
}

// Middleware
app.use(cors());
app.use(express.json());

// Chat endpoint using provider abstraction
app.post('/api/chat', async (req, res) => {
  const {
    message,
    chatId,
    userId = 'default-user',
    provider: providerName = 'claude',  // Per-request provider selection
    model = null  // Per-request model selection
  } = req.body;

  console.log('[CHAT] Request received:', message);
  console.log('[CHAT] Chat ID:', chatId);
  console.log('[CHAT] Provider:', providerName);
  console.log('[CHAT] Model:', model || '(default)');

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Validate provider
  const availableProviders = getAvailableProviders();
  if (!availableProviders.includes(providerName.toLowerCase())) {
    return res.status(400).json({
      error: `Invalid provider: ${providerName}. Available: ${availableProviders.join(', ')}`
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Processing request...' })}\n\n`);

  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  try {
    // Get or create Composio session for this user when configured.
    let composioSession = null;
    if (composio) {
      composioSession = composioSessions.get(userId);
      if (!composioSession) {
        console.log('[COMPOSIO] Creating new session for user:', userId);
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Initializing session...' })}\n\n`);
        composioSession = await composio.create(userId);
        composioSessions.set(userId, composioSession);
        console.log('[COMPOSIO] Session created with MCP URL:', composioSession.mcp.url);

        // Update opencode.json with the MCP config
        updateOpencodeConfig(composioSession.mcp.url, composioSession.mcp.headers);
        console.log('[OPENCODE] Updated opencode.json with MCP config');
      }
    }

    // Get the provider instance
    const provider = getProvider(providerName);

    // Build MCP servers config - passed to provider only when Composio is configured
    const mcpServers = composioSession
      ? {
          composio: {
            type: 'http',
            url: composioSession.mcp.url,
            headers: composioSession.mcp.headers
          }
        }
      : {};

    console.log('[CHAT] Using provider:', provider.name);
    console.log('[CHAT] All stored sessions:', Array.from(provider.sessions.entries()));

    // Stream responses from the provider
    try {
      for await (const chunk of provider.query({
        prompt: message,
        chatId,
        userId,
        mcpServers,
        model,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'],
        maxTurns: 100
      })) {
        if (chunk.type === 'tool_use') {
          console.log('[SSE] Sending tool_use:', chunk.name);
        }
        if (chunk.type === 'text') {
          console.log('[SSE] Sending text chunk, length:', chunk.content?.length || 0);
        }
        // Send chunk as SSE
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(data);
      }
    } catch (streamError) {
      console.error('[CHAT] Stream error during iteration:', streamError);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: streamError.message })}\n\n`);
      }
    }

    clearInterval(heartbeatInterval);
    if (!res.writableEnded) {
      res.end();
    }
    console.log('[CHAT] Stream completed');
  } catch (error) {
    clearInterval(heartbeatInterval);
    console.error('[CHAT] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Abort endpoint to stop active queries
app.post('/api/abort', (req, res) => {
  const { chatId, provider: providerName = 'claude' } = req.body;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  console.log('[ABORT] Request to abort chatId:', chatId, 'provider:', providerName);

  try {
    const provider = getProvider(providerName);
    const aborted = provider.abort(chatId);

    if (aborted) {
      console.log('[ABORT] Successfully aborted chatId:', chatId);
      res.json({ success: true, message: 'Query aborted' });
    } else {
      console.log('[ABORT] No active query found for chatId:', chatId);
      res.json({ success: false, message: 'No active query to abort' });
    }
  } catch (error) {
    console.error('[ABORT] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session bus: list incoming messages for a chat
app.get('/api/chats/messages', (req, res) => {
  const {
    chatId,
    status,
    includeBroadcast = 'false',
    excludeFromChatId = null,
    limit = '0'
  } = req.query;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  try {
    const messages = listMessages({
      chatId,
      status,
      includeBroadcast: includeBroadcast === 'true',
      excludeFromChatId: excludeFromChatId || null,
      limit: Number(limit || 0)
    });
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Session bus: unread count for badge
app.get('/api/chats/messages/unread-count', (req, res) => {
  const { chatId } = req.query;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  try {
    const count = getUnreadCount({ chatId });
    res.json({ chatId, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Session bus: create a note from one chat to another
app.post('/api/chats/messages', (req, res) => {
  const {
    fromChatId,
    fromTitle,
    toChatId,
    toTitle,
    content,
    kind,
    sourceMessageId = null
  } = req.body || {};

  try {
    const message = createMessage({
      fromChatId,
      fromTitle,
      toChatId,
      toTitle,
      content,
      kind,
      sourceMessageId
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Session bus: mark one message as read
app.post('/api/chats/messages/:id/read', (req, res) => {
  const { id } = req.params;

  try {
    const message = markRead({ messageId: id });
    res.json({ message });
  } catch (error) {
    if (error.message === 'message not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Codex handoff lane: create a task package for a Codex session
app.post('/api/codex/handoffs', (req, res) => {
  const {
    fromChatId,
    fromTitle,
    goal,
    repoPath = '',
    context = '',
    constraints = ''
  } = req.body || {};

  try {
    const handoff = createHandoff({
      fromChatId,
      fromTitle,
      goal,
      repoPath,
      context,
      constraints
    });
    res.status(201).json({ handoff });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Codex handoff lane: list task packages
app.get('/api/codex/handoffs', (req, res) => {
  const {
    chatId = null,
    status = null,
    limit = '50'
  } = req.query;

  try {
    const handoffs = listHandoffs({
      chatId: chatId || null,
      status: status || null,
      limit: Number(limit || 50)
    });
    res.json({ handoffs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Codex handoff lane: receive completion report and send it back to Cowork inbox
app.post('/api/codex/handoffs/:id/complete', (req, res) => {
  const { id } = req.params;
  const {
    summary,
    filesChanged = [],
    testsRun = [],
    blockers = [],
    nextSteps = []
  } = req.body || {};

  try {
    const result = completeHandoff({
      handoffId: id,
      summary,
      filesChanged,
      testsRun,
      blockers,
      nextSteps
    });
    res.json(result);
  } catch (error) {
    if (error.message === 'handoff not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Get available providers endpoint
app.get('/api/providers', (_req, res) => {
  res.json({
    providers: getAvailableProviders(),
    default: 'claude'
  });
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: getAvailableProviders()
  });
});

await initializeProviders();
await initializeComposioSession();

// Start server and keep reference to prevent garbage collection
const server = app.listen(PORT, () => {
  console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✓ Providers endpoint: GET http://localhost:${PORT}/api/providers`);
  console.log(`✓ Health check: GET http://localhost:${PORT}/api/health`);
  console.log(`✓ Available providers: ${getAvailableProviders().join(', ')}\n`);
});

// Keep the process alive
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Prevent the process from exiting
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
