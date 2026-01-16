import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { Composio } from '@composio/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Composio
const composio = new Composio();

const composioSessions = new Map();

const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Chat endpoint using Claude Agent SDK
app.post('/api/chat', async (req, res) => {
  const {
    message,
    chatId,
    userId = 'default-user',
    model = 'claude-sonnet-4-5-20250514',
    files = []
  } = req.body;

  console.log('[CHAT] Request received:', message);
  console.log('[CHAT] Chat ID:', chatId);
  console.log('[CHAT] Model:', model);
  console.log('[CHAT] Files attached:', files.length);

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // Get or create Composio session for this user
    let composioSession = composioSessions.get(userId);
    if (!composioSession) {
      console.log('[COMPOSIO] Creating new session for user:', userId);
      composioSession = await composio.create(userId);
      composioSessions.set(userId, composioSession);
      console.log('[COMPOSIO] Session created with MCP URL:', composioSession.mcp.url);
    }

    // Check if we have an existing Claude session for this chat
    console.log('[CHAT] All stored sessions:', Array.from(chatSessions.entries()));
    const existingSessionId = chatId ? chatSessions.get(chatId) : null;
    console.log('[CHAT] Existing session ID for', chatId, ':', existingSessionId || 'none (new chat)');

    // Build prompt with file contents if files are attached
    let fullPrompt = message;
    if (files && files.length > 0) {
      const fileContents = files.map(file => {
        if (file.type.startsWith('image/')) {
          return `[Attached image: ${file.name}]`;
        }
        return `--- File: ${file.name} ---\n${file.data}\n--- End of ${file.name} ---`;
      }).join('\n\n');
      fullPrompt = `${message}\n\nAttached files:\n${fileContents}`;
    }

    // Build query options with selected model
    const queryOptions = {
      model: model,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'],
      maxTurns: 20,
      mcpServers: {
        composio: {
          type: 'http',
          url: composioSession.mcp.url,
          headers: composioSession.mcp.headers
        }
      },
      permissionMode: 'bypassPermissions'
    };

    // If we have an existing session, resume it
    if (existingSessionId) {
      queryOptions.resume = existingSessionId;
      console.log('[CHAT] Resuming session:', existingSessionId);
    }

    console.log('[CHAT] Calling Claude Agent SDK...');

    // Stream responses from Claude Agent SDK
    for await (const chunk of query({
      prompt: fullPrompt,
      options: queryOptions
    })) {
      // Debug: log all system messages to find session_id
      if (chunk.type === 'system') {
        console.log('[CHAT] System message:', JSON.stringify(chunk, null, 2));
      }

      // Capture session ID from system init message
      // Try multiple possible locations for session_id
      if (chunk.type === 'system' && chunk.subtype === 'init') {
        const newSessionId = chunk.session_id || chunk.data?.session_id || chunk.sessionId;
        if (newSessionId && chatId) {
          chatSessions.set(chatId, newSessionId);
          console.log('[CHAT] Session ID captured:', newSessionId);
          console.log('[CHAT] Total sessions stored:', chatSessions.size);
        } else {
          console.log('[CHAT] No session_id found in init message');
        }
        // Send session ID to frontend
        if (newSessionId) {
          res.write(`data: ${JSON.stringify({ type: 'session_init', session_id: newSessionId })}\n\n`);
        }
        continue;
      }

      // If it's an assistant message, extract and emit text content
      if (chunk.type === 'assistant' && chunk.message && chunk.message.content) {
        const content = chunk.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: block.text })}\n\n`);
            } else if (block.type === 'tool_use') {
              const toolEvent = {
                type: 'tool_use',
                name: block.name,
                input: block.input,
                id: block.id
              };
              res.write(`data: ${JSON.stringify(toolEvent)}\n\n`);
              console.log('[CHAT] Tool use:', block.name);
            }
          }
        }
        continue;
      }

      // If it's a tool result, format it nicely
      if (chunk.type === 'tool_result' || chunk.type === 'result') {
        const eventData = {
          type: 'tool_result',
          result: chunk.result || chunk.content || chunk,
          tool_use_id: chunk.tool_use_id
        };
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        continue;
      }

      // Skip system chunks, pass through others
      if (chunk.type !== 'system') {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }

    // Send completion signal
    res.write('data: {"type": "done"}\n\n');
    res.end();
    console.log('[CHAT] Stream completed');
  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✓ Health check: GET http://localhost:${PORT}/api/health\n`);
});
