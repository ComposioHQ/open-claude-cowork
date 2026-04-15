/**
 * Browser API Shim for OPAL
 *
 * Replaces Electron's preload.js contextBridge when running in a browser.
 * Provides the same window.opalAPI interface using direct fetch() calls.
 */

const API = window.location.origin;

function fetchSSE(url, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    fetch(url, opts)
      .then(response => {
        resolve({
          getReader: async function () {
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

window.opalAPI = {
  // --- Project Operations ---
  createProject: async (name) => {
    const r = await fetch(`${API}/api/opal/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return r.json();
  },
  listProjects: async () => { const r = await fetch(`${API}/api/opal/projects`); return r.json(); },
  getProject: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}`); return r.json(); },
  getProjectSummary: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/summary`); return r.json(); },

  // --- Covenant ---
  agreeCovenant: async (id, identity) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/covenant`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity }),
    });
    return r.json();
  },

  // --- Pipeline ---
  transitionStage: async (id, stage, status, node = null) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/stages/${stage}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, node }),
    });
    return r.json();
  },
  advancePipeline: async (id) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    return r.json();
  },

  // --- Intake ---
  getIntake: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/intake`); return r.json(); },
  saveIntakeAnswer: async (id, section, key, value) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/intake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, key, value }),
    });
    return r.json();
  },
  saveIntakeBatch: async (id, answers) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/intake/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    return r.json();
  },
  validateIntake: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/intake/validate`); return r.json(); },
  getIntakeSchema: async () => { const r = await fetch(`${API}/api/opal/intake-schema`); return r.json(); },

  // --- ADA Agent ---
  sendAdaMessage: async (id, message) => fetchSSE(`${API}/api/opal/projects/${id}/agent/ada`, 'POST', { message }),
  abortAda: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/agent/ada/abort`, { method: 'POST' }); return r.json(); },

  // --- File Upload ---
  uploadIntakeFile: async (id, file) => {
    const buffer = await file.arrayBuffer();
    const r = await fetch(`${API}/api/opal/projects/${id}/intake/upload`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': file.name },
      body: buffer,
    });
    return r.json();
  },

  // --- Vault ---
  getVaultAssets: async (id, type = null) => {
    const url = type ? `${API}/api/opal/projects/${id}/vault?type=${type}` : `${API}/api/opal/projects/${id}/vault`;
    const r = await fetch(url);
    return r.json();
  },
  saveVaultAsset: async (id, type, stage, filename, content, metadata = {}) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/vault`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, stage, filename, content, metadata }),
    });
    return r.json();
  },
  approveVaultAsset: async (id, assetId) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/vault/${assetId}/approve`, { method: 'POST' });
    return r.json();
  },

  // --- Approvals ---
  getApprovals: async (id, stage = null) => {
    const url = stage !== null ? `${API}/api/opal/projects/${id}/approvals?stage=${stage}` : `${API}/api/opal/projects/${id}/approvals`;
    const r = await fetch(url);
    return r.json();
  },
  submitApproval: async (id, stage, node, approvedBy, approved, notes = '') => {
    const r = await fetch(`${API}/api/opal/projects/${id}/approvals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, node, approvedBy, approved, notes }),
    });
    return r.json();
  },

  // --- Logo Factory ---
  getLogoRecipes: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/logo/recipes`); return r.json(); },
  generateLogo: async (id, recipe = null, customPrompt = null) => fetchSSE(`${API}/api/opal/projects/${id}/logo/generate`, 'POST', { recipe, customPrompt }),
  critiqueLogo: async (id, svgCode) => fetchSSE(`${API}/api/opal/projects/${id}/logo/critique`, 'POST', { svgCode }),
  validateSvg: async (id, svgCode) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/logo/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svgCode }),
    });
    return r.json();
  },

  // --- Creative Foundation ---
  generateVibes: async (id) => fetchSSE(`${API}/api/opal/projects/${id}/vibe/generate`, 'POST'),
  saveDesignSystem: async (id, tokens, typography, colors) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/design-system`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, typography, colors }),
    });
    return r.json();
  },
  getDesignSystem: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/design-system`); return r.json(); },

  // --- Voice ---
  generateVoice: async (id) => fetchSSE(`${API}/api/opal/projects/${id}/voice/generate`, 'POST'),
  saveVoiceAnchor: async (id, yaml) => {
    const r = await fetch(`${API}/api/opal/projects/${id}/voice/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml }),
    });
    return r.json();
  },
  getVoiceAnchor: async (id) => { const r = await fetch(`${API}/api/opal/projects/${id}/voice`); return r.json(); },

  // --- Homepage ---
  generateHomepage: async (id) => fetchSSE(`${API}/api/opal/projects/${id}/homepage/generate`, 'POST'),

  // --- Content ---
  generateContent: async (id, layer = 'macro') => fetchSSE(`${API}/api/opal/projects/${id}/content/generate`, 'POST', { layer }),

  // --- Stages ---
  getStageDefinitions: async () => { const r = await fetch(`${API}/api/opal/stages`); return r.json(); },

  // --- Navigation (browser mode: no-op) ---
  navigateToChat: () => { window.location.href = '/'; },
  navigateToOpal: () => { /* already here */ },
};
