import { getProviderSession } from '../supabase/session-store.js';

/**
 * Base provider interface for AI agent providers.
 * All providers must implement these methods.
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.sessions = new Map();
  }

  /**
   * Get the provider name
   * @returns {string}
   */
  get name() {
    throw new Error('Provider must implement name getter');
  }

  /**
   * Initialize the provider
   * @returns {Promise<void>}
   */
  async initialize() {
    // Override in subclass if needed
  }

  /**
   * Execute a query/prompt and yield streaming responses
   * @param {Object} params
   * @param {string} params.prompt - The user message
   * @param {string} params.chatId - Chat session identifier
   * @param {string} params.userId - User identifier
   * @param {Object} params.mcpServers - MCP server configurations
   * @param {string[]} params.allowedTools - List of allowed tool names
   * @param {number} params.maxTurns - Maximum conversation turns
   * @yields {Object} Streaming response chunks
   */
  async *query(params) {
    throw new Error('Provider must implement query method');
  }

  /**
   * Get or create a session for a chat.
   * Checks in-memory Map first, falls back to Supabase DB lookup.
   * @param {string} chatId
   * @param {string} [userId]
   * @returns {Promise<string|null>} Session ID if exists
   */
  _buildSessionKey(chatId, userId) {
    if (userId === undefined || userId === null) return chatId;
    return `${userId}:${chatId}`;
  }

  async getSession(chatId, userId) {
    if (!chatId) return null;
    const key = this._buildSessionKey(chatId, userId);
    const cached = this.sessions.get(key);
    if (cached) return cached;

    // Fall back to DB
    try {
      const shouldSkipUserScope = userId === undefined || userId === null || String(userId).startsWith('anonymous');
      const dbSession = await (shouldSkipUserScope
        ? getProviderSession(chatId, this.name)
        : getProviderSession(chatId, this.name, userId));
      if (dbSession) {
        this.sessions.set(key, dbSession);
        return dbSession;
      }
    } catch {
      // DB unavailable — proceed without session
    }
    return null;
  }

  /**
   * Store a session ID for a chat
   * @param {string} chatId
   * @param {string} sessionId
   * @param {string} [userId]
   */
  setSession(chatId, sessionId, userId) {
    if (!chatId) return;
    const key = this._buildSessionKey(chatId, userId);
    this.sessions.set(key, sessionId);
  }

  /**
   * Abort an active query for a given chatId
   * @param {string} chatId
   * @returns {boolean} True if aborted, false if no active query
   */
  abort(chatId) {
    // Override in subclass to implement abort functionality
    return false;
  }

  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.sessions.clear();
  }
}
