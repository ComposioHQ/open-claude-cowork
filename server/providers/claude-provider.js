import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

/**
 * Claude Agent SDK provider implementation
 */
export class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    // Default allowed tools - matches server.js
    this.defaultAllowedTools = config.allowedTools || [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'
    ];
    this.defaultMaxTurns = config.maxTurns || 20;
    this.permissionMode = config.permissionMode || 'bypassPermissions';
    this.cwd = config.cwd ?? PROJECT_ROOT;
    this.queryClient = config.queryClient ?? claudeQuery;
    // Track active abort controllers per chatId
    this.abortControllers = new Map();
  }

  get name() {
    return 'claude';
  }

  /**
   * Abort an active query for a given chatId
   */
  abort(chatId) {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      console.log('[Claude] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  /**
   * Execute a query using Claude Agent SDK
   *
   * @param {Object} params
   * @param {string} params.prompt - The user message
   * @param {string} params.chatId - Chat session identifier
   * @param {Object} params.mcpServers - MCP server configurations (including Composio)
   * @param {string[]} [params.allowedTools] - List of allowed tool names
   * @param {number} [params.maxTurns] - Maximum conversation turns
   * @yields {Object} Normalized response chunks
   */
  async *query(params) {
    const {
      prompt,
      chatId,
      mcpServers = {},
      allowedTools = this.defaultAllowedTools,
      maxTurns = this.defaultMaxTurns
    } = params;

    // Build query options
    const queryOptions = {
      allowedTools,
      maxTurns,
      mcpServers,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
      settingSources: ['user', 'project']  // Enable Skills from filesystem
    };

    // Check for existing session - matches server.js session resumption logic
    const existingSessionId = chatId ? this.getSession(chatId) : null;
    console.log('[Claude] Existing session ID for', chatId, ':', existingSessionId || 'none (new chat)');

    // If we have an existing session, resume it
    if (existingSessionId) {
      queryOptions.resume = existingSessionId;
      console.log('[Claude] Resuming session:', existingSessionId);
    }

    console.log('[Claude] Calling Claude Agent SDK...');

    // Create abort controller for this request
    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(chatId, abortController);
    }

    try {
    // Stream responses from Claude Agent SDK
    for await (const chunk of this.queryClient({
      prompt,
      options: queryOptions,
      abortSignal: abortController.signal
    })) {
      // Debug: log all system messages to find session_id
      if (chunk.type === 'system') {
        console.log('[Claude] System message:', JSON.stringify(chunk, null, 2));
      }

      // Capture session ID from system init message - matches server.js logic
      if (chunk.type === 'system' && chunk.subtype === 'init') {
        const newSessionId = chunk.session_id || chunk.data?.session_id || chunk.sessionId;
        if (newSessionId && chatId) {
          this.setSession(chatId, newSessionId);
          console.log('[Claude] Session ID captured:', newSessionId);
          console.log('[Claude] Total sessions stored:', this.sessions.size);
        } else {
          console.log('[Claude] No session_id found in init message');
        }

        // Yield session init event
        if (newSessionId) {
          yield {
            type: 'session_init',
            session_id: newSessionId,
            provider: this.name
          };
        }
        continue;
      }

      // Handle assistant messages - extract text and tool_use blocks
      if (chunk.type === 'assistant' && chunk.message && chunk.message.content) {
        const content = chunk.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              yield {
                type: 'text',
                content: block.text,
                provider: this.name
              };
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                name: block.name,
                input: block.input,
                id: block.id,
                provider: this.name
              };
              console.log('[Claude] Tool use:', block.name);
            }
          }
        }
        continue;
      }

      // Handle tool results
      if (chunk.type === 'tool_result' || chunk.type === 'result') {
        yield {
          type: 'tool_result',
          result: chunk.result || chunk.content || chunk,
          tool_use_id: chunk.tool_use_id,
          provider: this.name
        };
        continue;
      }

      // Skip system chunks, pass through others
      if (chunk.type !== 'system') {
        yield {
          ...chunk,
          provider: this.name
        };
      }
    }

    // Signal completion
    yield {
      type: 'done',
      provider: this.name
    };

    console.log('[Claude] Stream completed');
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[Claude] Query aborted for chatId:', chatId);
        yield {
          type: 'aborted',
          provider: this.name
        };
      } else {
        throw error;
      }
    } finally {
      // Clean up abort controller
      if (chatId) {
        this.abortControllers.delete(chatId);
      }
    }
  }
}
