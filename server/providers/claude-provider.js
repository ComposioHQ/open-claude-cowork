import { query } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import { AsyncQueue } from '../utils/async-queue.js';

/**
 * Claude Agent SDK provider implementation
 * Matches the exact behavior from server.js
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
    // Track active abort controllers per chatId
    this.abortControllers = new Map();
    // Track pending permission requests: chatId → Map<requestId, { resolve }>
    this.pendingPermissions = new Map();
  }

  /**
   * Resolve a pending permission request from the UI.
   * @param {string} chatId
   * @param {string} requestId
   * @param {{ behavior: 'allow'|'deny', message?: string }} decision
   * @param {string} [userId]
   */
  resolvePermission(chatId, requestId, decision, userId) {
    const key = this._buildSessionKey(chatId, userId);
    const chatPerms = this.pendingPermissions.get(key);
    if (!chatPerms) return false;
    const pending = chatPerms.get(requestId);
    if (!pending) return false;
    pending.resolve(decision);
    chatPerms.delete(requestId);
    if (chatPerms.size === 0) this.pendingPermissions.delete(key);
    return true;
  }

  get name() {
    return 'claude';
  }

  /**
   * Abort an active query for a given chatId
   */
  abort(chatId, userId) {
    const key = this._buildSessionKey(chatId, userId);
    const controller = this.abortControllers.get(key);
    if (controller) {
      console.log('[Claude] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Execute a query using Claude Agent SDK
   * Matches the exact streaming logic from server.js
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
      userId,
      mcpServers = {},
      allowedTools = this.defaultAllowedTools,
      maxTurns = this.defaultMaxTurns,
      systemPromptAppend,
      permissionMode = this.permissionMode,
      allowedDirectories = [],
      agents
    } = params;

    // Build query options - exact match to server.js structure
    const queryOptions = {
      allowedTools,
      maxTurns,
      mcpServers,
      permissionMode,
      settingSources: ['user', 'project']  // Enable Skills from filesystem
    };

    // Pass sub-agent definitions to the SDK when provided
    if (agents && Object.keys(agents).length > 0) {
      queryOptions.agents = agents;
      console.log('[Claude] Sub-agent types registered:', Object.keys(agents).join(', '));
    }

    // Append user instructions to system prompt when configured
    if (systemPromptAppend) {
      queryOptions.systemPrompt = systemPromptAppend;
    }

    // Set up permission callback when not bypassing permissions
    const permissionQueue = new AsyncQueue();
    if (permissionMode !== 'bypassPermissions') {
      queryOptions.canUseTool = async (toolName, input) => {
        const requestId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const key = this._buildSessionKey(chatId, userId);

        // Store resolver so resolvePermission() can fulfil it from the HTTP endpoint
        if (!this.pendingPermissions.has(key)) {
          this.pendingPermissions.set(key, new Map());
        }

        const decision = await new Promise(resolve => {
          this.pendingPermissions.get(key).set(requestId, { resolve });

          // Push permission request event to the queue — SSE loop will emit it
          permissionQueue.push({
            type: 'permission_request',
            requestId,
            toolName,
            input,
            chatId,
            userId: userId || 'anonymous',
            provider: this.name
          });
        });

        console.log('[Claude] Permission decision for', toolName, ':', decision.behavior);
        return decision;
      };
    }

    // Check for existing session - matches server.js session resumption logic
    const existingSessionId = chatId ? await this.getSession(chatId, userId) : null;
    console.log('[Claude] Existing session ID for', chatId, ':', existingSessionId || 'none (new chat)');

    // If we have an existing session, resume it
    if (existingSessionId) {
      queryOptions.resume = existingSessionId;
      console.log('[Claude] Resuming session:', existingSessionId);
    }

    console.log('[Claude] Calling Claude Agent SDK... permissionMode:', permissionMode);

    // Create abort controller for this request
    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(this._buildSessionKey(chatId, userId), abortController);
    }

    try {
    // Track active sub-agent tool_use IDs so we can emit subagent_stop on their tool_result
    const activeSubagentIds = new Set();

    // Stream responses from Claude Agent SDK
    // We interleave SDK chunks with permission queue events so permission_request
    // events reach the SSE stream while the SDK waits for canUseTool to resolve.
    const sdkStream = query({
      prompt,
      options: queryOptions,
      abortSignal: abortController.signal
    });

    const sdkIterator = sdkStream[Symbol.asyncIterator]();
    let sdkDone = false;

    // Drive both the SDK iterator and the permission queue concurrently.
    // When canUseTool is waiting on user input, the SDK iterator blocks,
    // but permission_request events still flow from permissionQueue.
    while (true) {
      // Build a race between the next SDK chunk and the next permission event
      const promises = [];

      if (!sdkDone) {
        promises.push(
          sdkIterator.next().then(r => ({ source: 'sdk', ...r }))
        );
      }

      if (permissionMode !== 'bypassPermissions') {
        promises.push(
          permissionQueue.next().then(r => ({ source: 'perm', ...r }))
        );
      }

      if (promises.length === 0) break;

      const result = await Promise.race(promises);

      if (result.source === 'perm' && !result.done) {
        // Yield permission request event to SSE
        yield result.value;
        continue;
      }

      if (result.source === 'sdk') {
        if (result.done) {
          sdkDone = true;
          permissionQueue.close();
          break;
        }
        const chunk = result.value;

        // Debug: log all system messages to find session_id
        if (chunk.type === 'system') {
          console.log('[Claude] System message:', JSON.stringify(chunk, null, 2));
        }

        // Capture session ID from system init message
        if (chunk.type === 'system' && chunk.subtype === 'init') {
          const newSessionId = chunk.session_id || chunk.data?.session_id || chunk.sessionId;
          if (newSessionId && chatId) {
            this.setSession(chatId, newSessionId, userId);
            console.log('[Claude] Session ID captured:', newSessionId);
            console.log('[Claude] Total sessions stored:', this.sessions.size);
          } else {
            console.log('[Claude] No session_id found in init message');
          }

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
          const parentToolUseId = chunk.parent_tool_use_id || null;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                yield {
                  type: 'text',
                  content: block.text,
                  parent_tool_use_id: parentToolUseId,
                  provider: this.name
                };
              } else if (block.type === 'tool_use') {
                // Detect sub-agent spawn via Task tool
                if (block.name === 'Task') {
                  yield {
                    type: 'subagent_start',
                    agent_id: block.id,
                    agent_type: block.input?.subagent_type || block.input?.type || 'general',
                    description: block.input?.description || block.input?.prompt?.slice(0, 100) || '',
                    provider: this.name
                  };
                  activeSubagentIds.add(block.id);
                  console.log('[Claude] Sub-agent started:', block.id, block.input?.subagent_type);
                }
                yield {
                  type: 'tool_use',
                  name: block.name,
                  input: block.input,
                  id: block.id,
                  parent_tool_use_id: parentToolUseId,
                  provider: this.name
                };
                console.log('[Claude] Tool use:', block.name);
              }
            }
          }
          continue;
        }

        // Handle tool progress events from sub-agents
        if (chunk.type === 'tool_progress') {
          yield {
            type: 'tool_progress',
            tool_use_id: chunk.tool_use_id,
            tool_name: chunk.tool_name,
            parent_tool_use_id: chunk.parent_tool_use_id || null,
            elapsed_time_seconds: chunk.elapsed_time_seconds,
            provider: this.name
          };
          continue;
        }

        // Handle tool results
        if (chunk.type === 'tool_result' || chunk.type === 'result') {
          const toolUseId = chunk.tool_use_id;
          // Detect sub-agent completion — tool_result for a Task tool_use
          if (toolUseId && activeSubagentIds.has(toolUseId)) {
            activeSubagentIds.delete(toolUseId);
            yield {
              type: 'subagent_stop',
              agent_id: toolUseId,
              result: chunk.result || chunk.content || chunk,
              provider: this.name
            };
            console.log('[Claude] Sub-agent completed:', toolUseId);
          }
          yield {
            type: 'tool_result',
            result: chunk.result || chunk.content || chunk,
            tool_use_id: toolUseId,
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
        continue;
      } // end if sdk source
    } // end while(true)

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
      // Clean up abort controller and permission queue
      if (chatId) {
        const key = this._buildSessionKey(chatId, userId);
        this.abortControllers.delete(key);
        this.pendingPermissions.delete(key);
      }
      permissionQueue.close();
    }
  }
}
