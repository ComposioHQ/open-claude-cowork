const { contextBridge, ipcRenderer } = require('electron');

const SERVER_URL = 'http://localhost:3001';

// Store the current abort controller for cancelling requests
let currentAbortController = null;

// Expose safe API to renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Abort the current ongoing request (client-side)
  abortCurrentRequest: () => {
    if (currentAbortController) {
      console.log('[PRELOAD] Aborting current request');
      currentAbortController.abort();
      currentAbortController = null;
    }
  },

  // Stop the backend query execution
  stopQuery: async (chatId, provider = 'claude') => {
    console.log('[PRELOAD] Stopping query for chatId:', chatId, 'provider:', provider);
    try {
      const response = await fetch(`${SERVER_URL}/api/abort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, provider })
      });
      const result = await response.json();
      console.log('[PRELOAD] Stop query result:', result);
      return result;
    } catch (error) {
      console.error('[PRELOAD] Error stopping query:', error);
      return { success: false, error: error.message };
    }
  },

  // Send a chat message to the backend with chat ID, provider, and model
  sendMessage: async (message, chatId, provider = 'claude', model = null) => {
    // Abort any previous request
    if (currentAbortController) {
      currentAbortController.abort();
    }

    // Create new abort controller for this request
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    return new Promise((resolve, reject) => {
      console.log('[PRELOAD] Sending message to backend:', message);
      console.log('[PRELOAD] Chat ID:', chatId);
      console.log('[PRELOAD] Provider:', provider);
      console.log('[PRELOAD] Model:', model);

      fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, chatId, provider, model }),
        signal
      })
        .then(response => {

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
          }

          console.log('[PRELOAD] Connected to backend successfully');

          // Return a custom object with methods to read the stream
          resolve({
            getReader: async function() {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  try {
                    const { done, value } = await reader.read();
                    if (done) {
                      console.log('[PRELOAD] Stream ended');
                    }
                    return {
                      done,
                      value: done ? undefined : decoder.decode(value, { stream: true })
                    };
                  } catch (readError) {
                    console.error('[PRELOAD] Read error:', readError);
                    throw readError;
                  }
                }
              };
            }
          });
        })
        .catch(error => {
          console.error('[PRELOAD] Connection error:', error);
          console.error('[PRELOAD] Error stack:', error.stack);
          reject(new Error(`Failed to connect to backend: ${error.message}`));
        });
    });
  },

  // Get available providers from backend
  getProviders: async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/providers`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[PRELOAD] Error fetching providers:', error);
      return { providers: ['claude'], default: 'claude' };
    }
  },

  // Session bus: list messages for one chat
  listChatMessages: async (chatId, options = {}) => {
    try {
      const params = new URLSearchParams({ chatId });
      if (options?.status) {
        params.set('status', options.status);
      }
      if (options?.includeBroadcast) {
        params.set('includeBroadcast', 'true');
      }
      if (options?.excludeFromChatId) {
        params.set('excludeFromChatId', options.excludeFromChatId);
      }
      if (options?.limit) {
        params.set('limit', String(options.limit));
      }

      const response = await fetch(`${SERVER_URL}/api/chats/messages?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[PRELOAD] Error listing chat messages:', error);
      return { messages: [] };
    }
  },

  // Session bus: unread count for a chat
  getChatUnreadCount: async (chatId) => {
    try {
      const params = new URLSearchParams({ chatId });
      const response = await fetch(`${SERVER_URL}/api/chats/messages/unread-count?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[PRELOAD] Error fetching unread count:', error);
      return { chatId, count: 0 };
    }
  },

  // Session bus: create message from one chat to another
  createChatMessage: async (payload) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/chats/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      return result;
    } catch (error) {
      console.error('[PRELOAD] Error creating chat message:', error);
      return { error: error.message };
    }
  },

  // Session bus: mark message as read
  markChatMessageRead: async (messageId) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/chats/messages/${encodeURIComponent(messageId)}/read`, {
        method: 'POST'
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      return result;
    } catch (error) {
      console.error('[PRELOAD] Error marking chat message as read:', error);
      return { error: error.message };
    }
  },

  // Codex handoff lane: create a package for Codex to continue work
  createCodexHandoff: async (payload) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/codex/handoffs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      return result;
    } catch (error) {
      console.error('[PRELOAD] Error creating Codex handoff:', error);
      return { error: error.message };
    }
  },

  // Codex handoff lane: list packages for this Cowork chat
  listCodexHandoffs: async (options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options?.chatId) params.set('chatId', options.chatId);
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', String(options.limit));
      const response = await fetch(`${SERVER_URL}/api/codex/handoffs?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[PRELOAD] Error listing Codex handoffs:', error);
      return { handoffs: [] };
    }
  }
});
