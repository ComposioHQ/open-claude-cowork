const { contextBridge, ipcRenderer } = require('electron');

const SERVER_URL = 'http://localhost:3001';

// Store the current abort controller for cancelling requests
let currentAbortController = null;
// Auth token for Supabase JWT
let authToken = null;

// Helper to build headers with optional auth token
function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

// Expose safe API to renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  setAuthToken: (token) => { authToken = token; },
  getAuthToken: () => authToken,
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
        headers: buildHeaders(),
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
        headers: buildHeaders(),
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

  // Check if backend is reachable (for startup banner)
  checkBackend: async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/health`, { method: 'GET' });
      return response.ok;
    } catch (err) {
      return false;
    }
  },

  getSettings: async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/settings`, {
        headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (err) {
      throw new Error('Failed to load settings: ' + err.message);
    }
  },

  updateSettings: async (body) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/settings`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'HTTP ' + response.status);
      }
      return await response.json();
    } catch (err) {
      throw new Error(err.message || 'Failed to save settings');
    }
  },

  respondToPermission: async (chatId, requestId, behavior, message) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/permission-response`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ chatId, requestId, behavior, message })
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  getDatabaseAccess: async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/database/access`, { headers: buildHeaders() });
      if (!response.ok) return { allowed: false };
      return await response.json();
    } catch (err) {
      return { allowed: false };
    }
  },

  getDatabaseTables: async () => {
    const response = await fetch(`${SERVER_URL}/api/database/tables`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  getDatabaseTableSchema: async (tableName) => {
    const response = await fetch(`${SERVER_URL}/api/database/tables/${encodeURIComponent(tableName)}/schema`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  getDatabaseTableRows: async (tableName, params = {}) => {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', params.page);
    if (params.pageSize !== undefined) qs.set('pageSize', params.pageSize);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.search) qs.set('search', params.search);
    const qsStr = qs.toString();
    const url = `${SERVER_URL}/api/database/tables/${encodeURIComponent(tableName)}/rows${qsStr ? '?' + qsStr : ''}`;
    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  getDatabaseStats: async () => {
    const response = await fetch(`${SERVER_URL}/api/database/stats`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  // ==================== REPORTS ====================
  getReportSummary: async () => {
    const response = await fetch(`${SERVER_URL}/api/reports/summary`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getReportDailyMessages: async (days = 30) => {
    const response = await fetch(`${SERVER_URL}/api/reports/daily-messages?days=${days}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getReportProviderUsage: async (days = 30) => {
    const response = await fetch(`${SERVER_URL}/api/reports/provider-usage?days=${days}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getReportToolUsage: async (days = 30) => {
    const response = await fetch(`${SERVER_URL}/api/reports/tool-usage?days=${days}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  executeReportQuery: async (config) => {
    const response = await fetch(`${SERVER_URL}/api/reports/query`, {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getSavedReports: async () => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getSavedReport: async (reportId) => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved/${reportId}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  createSavedReport: async (data) => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved`, {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  updateSavedReport: async (reportId, data) => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved/${reportId}`, {
      method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  deleteSavedReport: async (reportId) => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved/${reportId}`, {
      method: 'DELETE', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  runSavedReport: async (reportId) => {
    const response = await fetch(`${SERVER_URL}/api/reports/saved/${reportId}/run`, {
      method: 'POST', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  // ==================== JOBS ====================
  getJobs: async () => {
    const response = await fetch(`${SERVER_URL}/api/jobs`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  createJob: async (data) => {
    const response = await fetch(`${SERVER_URL}/api/jobs`, {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getJob: async (jobId) => {
    const response = await fetch(`${SERVER_URL}/api/jobs/${jobId}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  updateJob: async (jobId, data) => {
    const response = await fetch(`${SERVER_URL}/api/jobs/${jobId}`, {
      method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  deleteJob: async (jobId) => {
    const response = await fetch(`${SERVER_URL}/api/jobs/${jobId}`, {
      method: 'DELETE', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getJobExecutions: async (jobId, limit = 10) => {
    const response = await fetch(`${SERVER_URL}/api/jobs/${jobId}/executions?limit=${limit}`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  runJob: async (jobId) => {
    const response = await fetch(`${SERVER_URL}/api/jobs/${jobId}/run`, {
      method: 'POST', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getWorkflows: async () => {
    const response = await fetch(`${SERVER_URL}/api/workflows`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  // ==================== VAULT ====================
  getVaultFolders: async (parentId) => {
    const url = parentId
      ? `${SERVER_URL}/api/vault/folders?parentId=${encodeURIComponent(parentId)}`
      : `${SERVER_URL}/api/vault/folders`;
    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  createVaultFolder: async (name, parentId) => {
    const response = await fetch(`${SERVER_URL}/api/vault/folders`, {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify({ name, parentId })
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  updateVaultFolder: async (folderId, data) => {
    const response = await fetch(`${SERVER_URL}/api/vault/folders/${folderId}`, {
      method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  deleteVaultFolder: async (folderId) => {
    const response = await fetch(`${SERVER_URL}/api/vault/folders/${folderId}`, {
      method: 'DELETE', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getVaultBreadcrumbs: async (folderId) => {
    const response = await fetch(`${SERVER_URL}/api/vault/folders/${folderId}/breadcrumbs`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getVaultAssets: async (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.folderId) qs.set('folderId', opts.folderId);
    if (opts.sort) qs.set('sort', opts.sort);
    if (opts.dir) qs.set('dir', opts.dir);
    if (opts.source) qs.set('source', opts.source);
    if (opts.limit) qs.set('limit', opts.limit);
    if (opts.offset) qs.set('offset', opts.offset);
    const qsStr = qs.toString();
    const url = `${SERVER_URL}/api/vault/assets${qsStr ? '?' + qsStr : ''}`;
    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  uploadVaultAsset: async (file, folderId, source) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folderId', folderId);
    if (source) formData.append('source', source);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(`${SERVER_URL}/api/vault/assets/upload`, {
      method: 'POST', headers, body: formData
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  updateVaultAsset: async (assetId, data) => {
    const response = await fetch(`${SERVER_URL}/api/vault/assets/${assetId}`, {
      method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  deleteVaultAsset: async (assetId) => {
    const response = await fetch(`${SERVER_URL}/api/vault/assets/${assetId}`, {
      method: 'DELETE', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getVaultAssetUrl: async (assetId) => {
    const response = await fetch(`${SERVER_URL}/api/vault/assets/${assetId}/url`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getVaultStats: async () => {
    const response = await fetch(`${SERVER_URL}/api/vault/stats`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },

  // Document generation
  getDocuments: async () => {
    const response = await fetch(`${SERVER_URL}/api/documents`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  getDocumentUrl: (filename) => {
    return `${SERVER_URL}/api/documents/${encodeURIComponent(filename)}`;
  },

  // ==================== PLUGINS ====================
  getPlugins: async () => {
    const response = await fetch(`${SERVER_URL}/api/plugins`, { headers: buildHeaders() });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  enablePlugin: async (name) => {
    const response = await fetch(`${SERVER_URL}/api/plugins/${encodeURIComponent(name)}/enable`, {
      method: 'POST', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  disablePlugin: async (name) => {
    const response = await fetch(`${SERVER_URL}/api/plugins/${encodeURIComponent(name)}/disable`, {
      method: 'POST', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  },
  installPlugin: async (gitUrl) => {
    const response = await fetch(`${SERVER_URL}/api/plugins/install`, {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify({ gitUrl })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'HTTP ' + response.status);
    }
    return await response.json();
  },
  removePlugin: async (dirName) => {
    const response = await fetch(`${SERVER_URL}/api/plugins/${encodeURIComponent(dirName)}`, {
      method: 'DELETE', headers: buildHeaders()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  }
});
