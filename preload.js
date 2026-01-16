const { contextBridge, ipcRenderer } = require('electron');

const SERVER_URL = 'http://localhost:3001';

// Expose safe API to renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Send a chat message to the backend with chat ID, model selection, and file attachments
  sendMessage: async (message, chatId, options = {}) => {
    return new Promise((resolve, reject) => {
      console.log('[PRELOAD] Sending message to backend:', message);
      console.log('[PRELOAD] Chat ID:', chatId);
      console.log('[PRELOAD] Model:', options.model);
      console.log('[PRELOAD] Files:', options.files?.length || 0);

      fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          chatId,
          model: options.model,
          files: options.files
        })
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          console.log('[PRELOAD] Connected to backend successfully');

          // Return a custom object with methods to read the stream
          resolve({
            getReader: async function() {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  const { done, value } = await reader.read();
                  return {
                    done,
                    value: done ? undefined : decoder.decode(value, { stream: true })
                  };
                }
              };
            }
          });
        })
        .catch(error => {
          console.error('[PRELOAD] Connection error:', error.message);
          reject(new Error(`Failed to connect to backend: ${error.message}`));
        });
    });
  }
});
