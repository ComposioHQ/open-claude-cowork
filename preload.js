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
  }
});

// Helper: fetch SSE stream and return a reader-compatible object
function fetchSSE(url, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    fetch(url, opts)
      .then(response => {
        resolve({
          getReader: async function() {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            return {
              read: async () => {
                const { done, value } = await reader.read();
                return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
              }
            };
          }
        });
      })
      .catch(reject);
  });
}

// Expose OPAL Pipeline API to renderer process
contextBridge.exposeInMainWorld('opalAPI', {
  // --- Project Operations ---
  createProject: async (name) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },

  listProjects: async () => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects`);
    return response.json();
  },

  getProject: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}`);
    return response.json();
  },

  getProjectSummary: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/summary`);
    return response.json();
  },

  // --- Covenant Gate ---
  agreeCovenant: async (projectId, identity) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/covenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity }),
    });
    return response.json();
  },

  // --- Pipeline State ---
  transitionStage: async (projectId, stage, status, node = null) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/stages/${stage}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, node }),
    });
    return response.json();
  },

  advancePipeline: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  },

  // --- Intake ---
  getIntake: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/intake`);
    return response.json();
  },

  saveIntakeAnswer: async (projectId, section, key, value) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, key, value }),
    });
    return response.json();
  },

  saveIntakeBatch: async (projectId, answers) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/intake/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    return response.json();
  },

  // --- Vault ---
  getVaultAssets: async (projectId, type = null) => {
    const url = type
      ? `${SERVER_URL}/api/opal/projects/${projectId}/vault?type=${type}`
      : `${SERVER_URL}/api/opal/projects/${projectId}/vault`;
    const response = await fetch(url);
    return response.json();
  },

  saveVaultAsset: async (projectId, type, stage, filename, content, metadata = {}) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, stage, filename, content, metadata }),
    });
    return response.json();
  },

  approveVaultAsset: async (projectId, assetId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/vault/${assetId}/approve`, {
      method: 'POST',
    });
    return response.json();
  },

  // --- Approvals ---
  getApprovals: async (projectId, stage = null) => {
    const url = stage !== null
      ? `${SERVER_URL}/api/opal/projects/${projectId}/approvals?stage=${stage}`
      : `${SERVER_URL}/api/opal/projects/${projectId}/approvals`;
    const response = await fetch(url);
    return response.json();
  },

  submitApproval: async (projectId, stage, node, approvedBy, approved, notes = '') => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, node, approvedBy, approved, notes }),
    });
    return response.json();
  },

  // --- ADA Agent Chat (Stage 1) ---
  sendAdaMessage: async (projectId, message) => {
    return new Promise((resolve, reject) => {
      fetch(`${SERVER_URL}/api/opal/projects/${projectId}/agent/ada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
        .then(response => {
          resolve({
            getReader: async function() {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  const { done, value } = await reader.read();
                  return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
                }
              };
            }
          });
        })
        .catch(reject);
    });
  },

  abortAda: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/agent/ada/abort`, {
      method: 'POST',
    });
    return response.json();
  },

  // --- File Upload (Stage 1) ---
  uploadIntakeFile: async (projectId, file) => {
    const buffer = await file.arrayBuffer();
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/intake/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name,
      },
      body: buffer,
    });
    return response.json();
  },

  // --- Logo Factory (Stage 2) ---
  getLogoRecipes: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/logo/recipes`);
    return response.json();
  },

  generateLogo: async (projectId, recipe = null, customPrompt = null) => {
    return new Promise((resolve, reject) => {
      fetch(`${SERVER_URL}/api/opal/projects/${projectId}/logo/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, customPrompt }),
      })
        .then(response => {
          resolve({
            getReader: async function() {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  const { done, value } = await reader.read();
                  return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
                }
              };
            }
          });
        })
        .catch(reject);
    });
  },

  critiqueLogo: async (projectId, svgCode) => {
    return new Promise((resolve, reject) => {
      fetch(`${SERVER_URL}/api/opal/projects/${projectId}/logo/critique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svgCode }),
      })
        .then(response => {
          resolve({
            getReader: async function() {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  const { done, value } = await reader.read();
                  return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
                }
              };
            }
          });
        })
        .catch(reject);
    });
  },

  validateSvg: async (projectId, svgCode) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/logo/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svgCode }),
    });
    return response.json();
  },

  // --- Intake Validation ---
  validateIntake: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/intake/validate`);
    return response.json();
  },

  getIntakeSchema: async () => {
    const response = await fetch(`${SERVER_URL}/api/opal/intake-schema`);
    return response.json();
  },

  // --- Stage 3: Creative Foundation ---
  generateVibes: async (projectId) => {
    return fetchSSE(`${SERVER_URL}/api/opal/projects/${projectId}/vibe/generate`, 'POST');
  },

  saveDesignSystem: async (projectId, tokens, typography, colors) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/design-system`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, typography, colors }),
    });
    return response.json();
  },

  getDesignSystem: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/design-system`);
    return response.json();
  },

  // --- Stage 4: Brand Speak Engine ---
  generateVoice: async (projectId) => {
    return fetchSSE(`${SERVER_URL}/api/opal/projects/${projectId}/voice/generate`, 'POST');
  },

  saveVoiceAnchor: async (projectId, yaml) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/voice/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml }),
    });
    return response.json();
  },

  getVoiceAnchor: async (projectId) => {
    const response = await fetch(`${SERVER_URL}/api/opal/projects/${projectId}/voice`);
    return response.json();
  },

  // --- Stage 5: Homepage Build ---
  generateHomepage: async (projectId) => {
    return fetchSSE(`${SERVER_URL}/api/opal/projects/${projectId}/homepage/generate`, 'POST');
  },

  // --- Stage 6: Content Strategy ---
  generateContent: async (projectId, layer = 'macro') => {
    return fetchSSE(`${SERVER_URL}/api/opal/projects/${projectId}/content/generate`, 'POST', { layer });
  },

  // --- Stage Definitions ---
  getStageDefinitions: async () => {
    const response = await fetch(`${SERVER_URL}/api/opal/stages`);
    return response.json();
  },

  // --- Navigation ---
  navigateToChat: () => {
    ipcRenderer.send('navigate', 'chat');
  },

  navigateToOpal: () => {
    ipcRenderer.send('navigate', 'opal');
  },
});
