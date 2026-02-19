/**
 * Web adapter for window.electronAPI when running in the browser (e.g. deployed on Coolify).
 * Uses relative URLs when served from the same origin; uses API_BASE (or localhost:3001) when
 * loaded as file:// so /api/settings etc. resolve to the backend.
 */
(function () {
  if (typeof window.electronAPI !== 'undefined') return;

  let currentAbortController = null;
  let authToken = null;

  // When origin is file: (e.g. opening index.html in browser), relative fetch hits file:// and 404s.
  var apiBase = '';
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    apiBase = window.API_BASE_URL || 'http://localhost:3001';
  } else if (typeof window !== 'undefined' && window.API_BASE_URL) {
    apiBase = window.API_BASE_URL;
  }

  // Expose apiBase for other scripts (e.g. auth.js)
  window._apiBase = apiBase;

  function apiUrl(path) {
    return apiBase + path;
  }

  // Build headers with optional auth token
  function buildHeaders(extra) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (authToken) {
      headers['Authorization'] = 'Bearer ' + authToken;
    }
    return headers;
  }

  window.electronAPI = {
    setAuthToken: function (token) { authToken = token || null; },
    getAuthToken: function () { return authToken || null; },

    abortCurrentRequest: function () {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
    },

    stopQuery: async function (chatId, provider) {
      try {
        const response = await fetch(apiUrl('/api/abort'), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ chatId, provider: provider || 'claude' })
        });
        return await response.json();
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    sendMessage: function (message, chatId, provider, model) {
      if (currentAbortController) currentAbortController.abort();
      currentAbortController = new AbortController();

      return fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ message, chatId, provider: provider || 'claude', model }),
        signal: currentAbortController.signal
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
        return {
          getReader: async function () {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            return {
              read: async function () {
                const { done, value } = await reader.read();
                return { done, value: done ? undefined : decoder.decode(value, { stream: true }) };
              }
            };
          }
        };
      }).catch(function (err) {
        throw new Error('Failed to connect to backend: ' + err.message);
      });
    },

    updateChat: async function (chatId, data) {
      const response = await fetch(apiUrl('/api/chats/' + chatId), {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    getProviders: async function () {
      try {
        const response = await fetch(apiUrl('/api/providers'));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      } catch (err) {
        return { providers: ['claude'], default: 'claude' };
      }
    },

    checkBackend: async function () {
      try {
        const response = await fetch(apiUrl('/api/health'), { method: 'GET' });
        return response.ok;
      } catch (err) {
        return false;
      }
    },

    getSettings: async function () {
      const response = await fetch(apiUrl('/api/settings'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    updateSettings: async function (body) {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || 'HTTP ' + response.status);
      }
      return await response.json();
    },

    respondToPermission: async function (chatId, requestId, behavior, message) {
      try {
        const response = await fetch(apiUrl('/api/permission-response'), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ chatId, requestId, behavior, message })
        });
        return await response.json();
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    getDatabaseAccess: async function () {
      try {
        const response = await fetch(apiUrl('/api/database/access'), { headers: buildHeaders() });
        if (!response.ok) return { allowed: false };
        return await response.json();
      } catch (err) {
        return { allowed: false };
      }
    },

    getDatabaseTables: async function () {
      const response = await fetch(apiUrl('/api/database/tables'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    getDatabaseTableSchema: async function (tableName) {
      const response = await fetch(apiUrl('/api/database/tables/' + encodeURIComponent(tableName) + '/schema'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    getDatabaseTableRows: async function (tableName, params) {
      var qs = new URLSearchParams();
      if (params) {
        if (params.page !== undefined) qs.set('page', params.page);
        if (params.pageSize !== undefined) qs.set('pageSize', params.pageSize);
        if (params.sort) qs.set('sort', params.sort);
        if (params.dir) qs.set('dir', params.dir);
        if (params.search) qs.set('search', params.search);
      }
      var url = apiUrl('/api/database/tables/' + encodeURIComponent(tableName) + '/rows');
      var qsStr = qs.toString();
      if (qsStr) url += '?' + qsStr;
      const response = await fetch(url, { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    getDatabaseStats: async function () {
      const response = await fetch(apiUrl('/api/database/stats'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    // ==================== REPORTS ====================
    getReportSummary: async function () {
      const response = await fetch(apiUrl('/api/reports/summary'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getReportDailyMessages: async function (days) {
      const response = await fetch(apiUrl('/api/reports/daily-messages?days=' + (days || 30)), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getReportProviderUsage: async function (days) {
      const response = await fetch(apiUrl('/api/reports/provider-usage?days=' + (days || 30)), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getReportToolUsage: async function (days) {
      const response = await fetch(apiUrl('/api/reports/tool-usage?days=' + (days || 30)), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    executeReportQuery: async function (config) {
      const response = await fetch(apiUrl('/api/reports/query'), {
        method: 'POST', headers: buildHeaders(), body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getSavedReports: async function () {
      const response = await fetch(apiUrl('/api/reports/saved'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getSavedReport: async function (reportId) {
      const response = await fetch(apiUrl('/api/reports/saved/' + reportId), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    createSavedReport: async function (data) {
      const response = await fetch(apiUrl('/api/reports/saved'), {
        method: 'POST', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    updateSavedReport: async function (reportId, data) {
      const response = await fetch(apiUrl('/api/reports/saved/' + reportId), {
        method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    deleteSavedReport: async function (reportId) {
      const response = await fetch(apiUrl('/api/reports/saved/' + reportId), {
        method: 'DELETE', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    runSavedReport: async function (reportId) {
      const response = await fetch(apiUrl('/api/reports/saved/' + reportId + '/run'), {
        method: 'POST', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    // ==================== JOBS ====================
    getJobs: async function () {
      const response = await fetch(apiUrl('/api/jobs'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    createJob: async function (data) {
      const response = await fetch(apiUrl('/api/jobs'), {
        method: 'POST', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || body.message || 'HTTP ' + response.status);
      }
      return await response.json();
    },
    getJob: async function (jobId) {
      const response = await fetch(apiUrl('/api/jobs/' + jobId), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    updateJob: async function (jobId, data) {
      const response = await fetch(apiUrl('/api/jobs/' + jobId), {
        method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || body.message || 'HTTP ' + response.status);
      }
      return await response.json();
    },
    deleteJob: async function (jobId) {
      const response = await fetch(apiUrl('/api/jobs/' + jobId), {
        method: 'DELETE', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getJobExecutions: async function (jobId, limit) {
      const response = await fetch(apiUrl('/api/jobs/' + jobId + '/executions?limit=' + (limit || 10)), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    runJob: async function (jobId) {
      const response = await fetch(apiUrl('/api/jobs/' + jobId + '/run'), {
        method: 'POST', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getWorkflows: async function () {
      const response = await fetch(apiUrl('/api/workflows'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    // ==================== VAULT ====================
    getVaultFolders: async function (parentId) {
      var url = '/api/vault/folders';
      if (parentId) url += '?parentId=' + encodeURIComponent(parentId);
      const response = await fetch(apiUrl(url), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    createVaultFolder: async function (name, parentId) {
      const response = await fetch(apiUrl('/api/vault/folders'), {
        method: 'POST', headers: buildHeaders(), body: JSON.stringify({ name: name, parentId: parentId })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    updateVaultFolder: async function (folderId, data) {
      const response = await fetch(apiUrl('/api/vault/folders/' + folderId), {
        method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    deleteVaultFolder: async function (folderId) {
      const response = await fetch(apiUrl('/api/vault/folders/' + folderId), {
        method: 'DELETE', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getVaultBreadcrumbs: async function (folderId) {
      const response = await fetch(apiUrl('/api/vault/folders/' + folderId + '/breadcrumbs'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getVaultAssets: async function (opts) {
      var qs = new URLSearchParams();
      if (opts) {
        if (opts.folderId) qs.set('folderId', opts.folderId);
        if (opts.sort) qs.set('sort', opts.sort);
        if (opts.dir) qs.set('dir', opts.dir);
        if (opts.source) qs.set('source', opts.source);
        if (opts.limit) qs.set('limit', opts.limit);
        if (opts.offset) qs.set('offset', opts.offset);
      }
      var qsStr = qs.toString();
      var url = '/api/vault/assets' + (qsStr ? '?' + qsStr : '');
      const response = await fetch(apiUrl(url), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    uploadVaultAsset: async function (file, folderId, source) {
      var formData = new FormData();
      formData.append('file', file);
      if (folderId) formData.append('folderId', folderId);
      if (source) formData.append('source', source);
      var headers = buildHeaders();
      delete headers['Content-Type'];
      const response = await fetch(apiUrl('/api/vault/assets/upload'), {
        method: 'POST', headers: headers, body: formData
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    updateVaultAsset: async function (assetId, data) {
      const response = await fetch(apiUrl('/api/vault/assets/' + assetId), {
        method: 'PATCH', headers: buildHeaders(), body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    deleteVaultAsset: async function (assetId) {
      const response = await fetch(apiUrl('/api/vault/assets/' + assetId), {
        method: 'DELETE', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getVaultAssetUrl: async function (assetId) {
      const response = await fetch(apiUrl('/api/vault/assets/' + assetId + '/url'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getVaultStats: async function () {
      const response = await fetch(apiUrl('/api/vault/stats'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    // ==================== FOLDERS ====================
    getFolders: async function (type, parentId) {
      var qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (parentId) qs.set('parentId', parentId);
      var url = apiUrl('/api/folders?' + qs.toString());
      const response = await fetch(url, { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    createFolder: async function (name, type, parentId) {
      const response = await fetch(apiUrl('/api/folders'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ name: name, type: type, parentId: parentId })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    renameFolder: async function (folderId, name) {
      const response = await fetch(apiUrl('/api/folders/' + folderId), {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ name: name })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    deleteFolder: async function (folderId) {
      const response = await fetch(apiUrl('/api/folders/' + folderId), {
        method: 'DELETE',
        headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },

    // Document generation
    getDocuments: async function () {
      const response = await fetch(apiUrl('/api/documents'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    getDocumentUrl: function (filename) {
      return apiUrl('/api/documents/' + encodeURIComponent(filename));
    },

    // ==================== PLUGINS ====================
    getPlugins: async function () {
      const response = await fetch(apiUrl('/api/plugins'), { headers: buildHeaders() });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    enablePlugin: async function (name) {
      const response = await fetch(apiUrl('/api/plugins/' + encodeURIComponent(name) + '/enable'), {
        method: 'POST', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    disablePlugin: async function (name) {
      const response = await fetch(apiUrl('/api/plugins/' + encodeURIComponent(name) + '/disable'), {
        method: 'POST', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    },
    installPlugin: async function (gitUrl) {
      const response = await fetch(apiUrl('/api/plugins/install'), {
        method: 'POST', headers: buildHeaders(), body: JSON.stringify({ url: gitUrl })
      });
      if (!response.ok) {
        const data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || 'HTTP ' + response.status);
      }
      return await response.json();
    },
    removePlugin: async function (dirName) {
      const response = await fetch(apiUrl('/api/plugins/' + encodeURIComponent(dirName)), {
        method: 'DELETE', headers: buildHeaders()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    }
  };
})();
