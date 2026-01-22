import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk';
import { BaseProvider } from './base-provider.js';

/**
 * Opencode SDK provider implementation
 * Adapts Opencode SDK to match the same interface as Claude provider
 */
export class OpencodeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.client = null;
    this.serverInstance = null;
    this.defaultModel = config.model;
    this.hostname = config.hostname || '127.0.0.1';
    this.port = config.port || 4096;
    this.useExistingServer = config.useExistingServer || false;
    this.existingServerUrl = config.existingServerUrl || null;
    this.browserPath = config.browserPath || process.env.BROWSER_PATH || null;
  }

  get name() {
    return 'opencode';
  }

  /**
   * Initialize the Opencode client/server
   */
  async initialize() {
    if (this.client) return;

    try {
      if (this.useExistingServer && this.existingServerUrl) {
        // Connect to existing Opencode server
        console.log('[Opencode] Connecting to existing server:', this.existingServerUrl);
        this.client = createOpencodeClient({
          baseUrl: this.existingServerUrl
        });
      } else {
        // Create new Opencode server and client
        console.log('[Opencode] Creating new server on', this.hostname, ':', this.port);
        const createOptions = {
          hostname: this.hostname,
          port: this.port
        };
        
        // Add browser path if configured
        if (this.browserPath) {
          console.log('[Opencode] Using custom browser:', this.browserPath);
          createOptions.browser = {
            executablePath: this.browserPath
          };
        }
        
        const { client, server } = await createOpencode(createOptions);
        this.client = client;
        this.serverInstance = server;
      }
      console.log('[Opencode] Initialized successfully');
    } catch (error) {
      console.error('[Opencode] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Build MCP server config for Opencode format
   * Converts from Claude-style mcpServers to Opencode format
   */
  buildMcpConfig(mcpServers) {
    const mcpConfig = {};

    for (const [name, config] of Object.entries(mcpServers)) {
      if (config.type === 'http' || config.type === 'remote') {
        mcpConfig[name] = {
          type: 'remote',
          url: config.url,
          headers: config.headers || {}
        };
      } else if (config.type === 'local') {
        mcpConfig[name] = {
          type: 'local',
          command: config.command,
          environment: config.environment || {}
        };
      }
    }

    return mcpConfig;
  }

  /**
   * Execute a query using Opencode SDK
   * Matches the same interface as Claude provider
   *
   * @param {Object} params
   * @param {string} params.prompt - The user message
   * @param {string} params.chatId - Chat session identifier
   * @param {Object} params.mcpServers - MCP server configurations (including Composio)
   * @param {string} [params.model] - Model to use (e.g., 'anthropic/claude-sonnet-4-20250514')
   * @param {string[]} [params.allowedTools] - List of allowed tool names
   * @param {number} [params.maxTurns] - Maximum conversation turns
   * @yields {Object} Normalized response chunks
   */
  async *query(params) {
    const {
      prompt,
      chatId,
      mcpServers = {},
      model = null
    } = params;

    // Use provided model or fall back to default
    const modelToUse = model || this.defaultModel || 'opencode/big-pickle';
    console.log('[Opencode] Using model:', modelToUse);

    // Ensure client is initialized
    await this.initialize();

    // Check for existing session
    let sessionId = chatId ? this.getSession(chatId) : null;
    console.log('[Opencode] Session for', chatId, ':', sessionId || 'new');

    try {
      // Note: MCP servers are configured in opencode.json, not passed via API
      // The backend server.js writes the Composio MCP URL to opencode.json

      // Create session if needed
      if (!sessionId) {
        console.log('[Opencode] Creating session with model:', modelToUse);
        const sessionResult = await this.client.session.create({
          body: {
            config: {
              model: modelToUse
            }
          }
        });
        sessionId = sessionResult.data?.id || sessionResult.id;
        if (chatId && sessionId) {
          this.setSession(chatId, sessionId);
        }
        console.log('[Opencode] Session:', sessionId);

        yield {
          type: 'session_init',
          session_id: sessionId,
          provider: this.name
        };
      }

      // Parse model string into providerID and modelID
      const [providerID, ...modelParts] = modelToUse.split('/');
      const modelID = modelParts.join('/');

      console.log('[Opencode] Subscribing to events...');

      // Subscribe to events for streaming
      const events = await this.client.event.subscribe();

      // Send prompt async (returns immediately, results come via events)
      console.log('[Opencode] Sending prompt async...');
      await this.client.session.promptAsync({
        path: { id: sessionId },
        body: {
          model: { providerID, modelID },
          parts: [{ type: 'text', text: prompt }]
        }
      });

      console.log('[Opencode] Listening for events...');

      // Track assistant's text parts (accumulates as streaming happens)
      let userMessageId = null;
      const assistantParts = new Map(); // partId -> latest text
      let lastYieldedLength = new Map(); // partId -> length already yielded
      const yieldedToolCalls = new Set(); // callID -> prevent duplicate tool yields

      // Listen to event stream
      for await (const event of events.stream) {
        const props = event.properties || {};
        const part = props.part || props;
        const eventSessionId = props.sessionID || part?.sessionID || props.session?.id;

        // Filter events for our session
        if (eventSessionId && eventSessionId !== sessionId) {
          continue;
        }

        if (event.type === 'message.part.updated') {
          const messageId = part?.messageID;
          const partId = part?.id;

          // Skip user's message (first text message we see)
          if (!userMessageId && part?.type === 'text') {
            userMessageId = messageId;
            continue;
          }

          // Skip parts from user's message
          if (messageId === userMessageId) {
            continue;
          }

          // Handle streaming text - yield only the NEW delta
          if (part?.type === 'text' && part?.text) {
            const prevLength = lastYieldedLength.get(partId) || 0;
            const fullText = part.text;

            if (fullText.length > prevLength) {
              const delta = fullText.slice(prevLength);
              yield {
                type: 'text',
                content: delta,
                provider: this.name
              };
              lastYieldedLength.set(partId, fullText.length);
            }
          } else if (part?.type === 'reasoning') {
            const text = part.reasoning || part.text || '';
            const prevLength = lastYieldedLength.get(partId) || 0;

            if (text.length > prevLength) {
              const delta = text.slice(prevLength);
              yield {
                type: 'text',
                content: delta,
                provider: this.name,
                isReasoning: true
              };
              lastYieldedLength.set(partId, text.length);
            }
          } else if (part?.type === 'tool-invocation' || part?.type === 'tool_invocation' || part?.type === 'tool') {
            const toolId = part.toolInvocationId || part.callID || part.id || part.tool_invocation_id;

            // Skip if we've already yielded this tool call
            if (yieldedToolCalls.has(toolId)) {
              continue;
            }
            if (part.state?.status === 'pending') {
              console.log('[Opencode] Skipping pending tool call:', part.tool);
              continue;
            }

            const toolName = part.toolName || part.tool || part.name;
            const toolArgs = part.state?.input || part.args || part.input || part.parameters || part.params || part.toolInput || {};

            console.log('[Opencode] Tool:', toolName, 'args:', JSON.stringify(toolArgs).slice(0, 80));

            yieldedToolCalls.add(toolId);

            yield {
              type: 'tool_use',
              name: toolName,
              input: toolArgs,
              id: toolId,
              provider: this.name
            };
          } else if (part?.type === 'tool-result' || part?.type === 'tool_result') {
            const toolId = part.toolInvocationId || part.callID || part.id || part.tool_invocation_id;
            const resultData = part.result || part.output || part.content;
            console.log('[Opencode] Tool result detected:', toolId, 'result:', JSON.stringify(resultData).slice(0, 100));
            yield {
              type: 'tool_result',
              result: resultData,
              tool_use_id: toolId,
              provider: this.name
            };
          } else if (part?.type === 'step-start' || part?.type === 'step-finish') {
            // Skip step markers
            console.log('[Opencode] Skipping step marker:', part.type);
          } else {
            console.log('[Opencode] Unhandled part type:', part?.type, 'full part:', JSON.stringify(part).slice(0, 200));
          }
        } else if (event.type === 'message.updated') {
          // Just log - parts come from message.part.updated, not here
          const message = props.message || props;
          console.log(' Msg updated:', message?.info?.role, 'id:', message?.info?.id?.slice(-10));
        } else if (event.type === 'session.idle') {
          console.log('[Opencode] Session idle - done');
          break;
        } else if (event.type === 'session.error') {
          console.error('[Opencode] Session error:', props);
          yield {
            type: 'error',
            message: props.message || 'Session error',
            provider: this.name
          };
          break;
        }
      }

      yield {
        type: 'done',
        provider: this.name
      };

      console.log('[Opencode] Stream completed');

    } catch (error) {
      console.error('[Opencode] Query error:', error);
      yield {
        type: 'error',
        message: error.message,
        provider: this.name
      };
    }
  }

  /**
   * Normalize a streaming chunk to match Claude provider output format
   */
  normalizeChunk(chunk) {
    if (!chunk) return null;

    // Handle different chunk types from Opencode
    if (chunk.type === 'text' || chunk.type === 'content') {
      return {
        type: 'text',
        content: chunk.text || chunk.content || '',
        provider: this.name
      };
    }

    if (chunk.type === 'tool_use' || chunk.type === 'tool_call') {
      console.log('[Opencode] Tool use:', chunk.name || chunk.tool);
      return {
        type: 'tool_use',
        name: chunk.name || chunk.tool,
        input: chunk.input || chunk.arguments || {},
        id: chunk.id || chunk.tool_call_id,
        provider: this.name
      };
    }

    if (chunk.type === 'tool_result') {
      return {
        type: 'tool_result',
        result: chunk.result || chunk.output || chunk.content,
        tool_use_id: chunk.tool_use_id || chunk.tool_call_id,
        provider: this.name
      };
    }

    // Pass through other chunk types
    return {
      ...chunk,
      provider: this.name
    };
  }

  /**
   * Normalize a complete message to chunks
   */
  normalizeMessage(message) {
    if (!message) return null;

    const chunks = [];

    // Handle message parts/content
    if (message.parts) {
      for (const part of message.parts) {
        if (part.type === 'text') {
          chunks.push({
            type: 'text',
            content: part.text,
            provider: this.name
          });
        } else if (part.type === 'tool-invocation') {
          chunks.push({
            type: 'tool_use',
            name: part.toolName,
            input: part.args,
            id: part.toolInvocationId,
            provider: this.name
          });
          console.log('[Opencode] Tool use:', part.toolName);
        } else if (part.type === 'tool-result') {
          chunks.push({
            type: 'tool_result',
            result: part.result,
            tool_use_id: part.toolInvocationId,
            provider: this.name
          });
        }
      }
    } else if (message.content) {
      // Simple text content
      chunks.push({
        type: 'text',
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        provider: this.name
      });
    }

    return chunks.length > 0 ? chunks : null;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await super.cleanup();
    if (this.serverInstance) {
      // Close server if we created it
      try {
        await this.serverInstance.close();
        console.log('[Opencode] Server closed');
      } catch (e) {
        console.error('[Opencode] Error closing server:', e);
      }
    }
    this.client = null;
    this.serverInstance = null;
  }
}
