import { BaseProvider } from './base-provider.js';

/**
 * MiniMax provider using OpenAI-compatible API
 * Supports MiniMax-M3 (default), MiniMax-M2.7, and MiniMax-M2.7-highspeed models
 */
export class MiniMaxProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY;
    this.baseURL = config.baseURL || 'https://api.minimax.io/v1';
    this.defaultModel = config.model || 'MiniMax-M3';
    // Maintain conversation history per chatId for multi-turn support
    this.conversations = new Map();
    // Track active abort controllers per chatId
    this.abortControllers = new Map();
  }

  get name() {
    return 'minimax';
  }

  /**
   * Abort an active query for a given chatId
   */
  abort(chatId) {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      console.log('[MiniMax] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  /**
   * Execute a query using MiniMax OpenAI-compatible API
   *
   * @param {Object} params
   * @param {string} params.prompt - The user message
   * @param {string} params.chatId - Chat session identifier
   * @param {string} [params.model] - Model to use (MiniMax-M3, MiniMax-M2.7, or MiniMax-M2.7-highspeed)
   * @yields {Object} Normalized response chunks
   */
  async *query(params) {
    const { prompt, chatId, model = this.defaultModel } = params;

    if (!this.apiKey) {
      yield {
        type: 'error',
        message: 'MINIMAX_API_KEY is not set. Please add it to your .env file.',
        provider: this.name
      };
      return;
    }

    // Build/update conversation history for multi-turn support
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    const history = this.conversations.get(chatId);
    history.push({ role: 'user', content: prompt });

    // Create abort controller for this request
    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(chatId, abortController);
    }

    console.log('[MiniMax] Sending request, model:', model, 'chatId:', chatId);

    let response;
    try {
      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: history,
          temperature: 1.0,  // MiniMax requires temperature in (0.0, 1.0], not 0
          stream: true,
        }),
        signal: abortController.signal,
      });
    } catch (error) {
      if (chatId) this.abortControllers.delete(chatId);
      if (error.name === 'AbortError') {
        yield { type: 'aborted', provider: this.name };
        return;
      }
      yield { type: 'error', message: error.message, provider: this.name };
      return;
    }

    if (!response.ok) {
      if (chatId) this.abortControllers.delete(chatId);
      const errorText = await response.text();
      console.error('[MiniMax] API error:', response.status, errorText);
      yield {
        type: 'error',
        message: `MiniMax API error ${response.status}: ${errorText}`,
        provider: this.name
      };
      return;
    }

    // Parse SSE streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              yield { type: 'text', content: delta, provider: this.name };
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        yield { type: 'aborted', provider: this.name };
        return;
      }
      yield { type: 'error', message: error.message, provider: this.name };
      return;
    } finally {
      if (chatId) this.abortControllers.delete(chatId);
    }

    // Save assistant response to history for next turn
    if (assistantContent) {
      history.push({ role: 'assistant', content: assistantContent });
    }

    console.log('[MiniMax] Stream completed, response length:', assistantContent.length);
    yield { type: 'done', provider: this.name };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await super.cleanup();
    this.conversations.clear();
    this.abortControllers.clear();
  }
}
