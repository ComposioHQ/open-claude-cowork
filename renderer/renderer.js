// DOM Elements - Views
const homeView = document.getElementById('homeView');
const chatView = document.getElementById('chatView');

// DOM Elements - Home
const homeForm = document.getElementById('homeForm');
const homeInput = document.getElementById('homeInput');
const homeSendBtn = document.getElementById('homeSendBtn');

// DOM Elements - Chat
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatMessages = document.getElementById('chatMessages');
const chatTitle = document.getElementById('chatTitle');

// DOM Elements - Right Sidebar
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const rightSidebarExpand = document.getElementById('rightSidebarExpand');
const sidebarTabs = document.getElementById('sidebarTabs');
const progressPanel = document.getElementById('progressPanel');
const contextPanel = document.getElementById('contextPanel');
const artifactPanel = document.getElementById('artifactPanel');
const tabProgress = document.getElementById('tabProgress');
const tabContext = document.getElementById('tabContext');
const tabArtifact = document.getElementById('tabArtifact');

function showSidebarTab(tabName) {
  const tabs = document.querySelectorAll('.sidebar-tab');
  const panels = document.querySelectorAll('.sidebar-panel');
  
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  panels.forEach(p => p.classList.toggle('hidden', p.id !== `${tabName}Panel`));
  
  // Specific panel handling if needed
  if (tabName === 'artifact' && !artifactPanel.classList.contains('hidden')) {
    tabArtifact.disabled = false;
  }
}

// Update the existing click listener to use this helper
if (sidebarTabs) {
  sidebarTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.sidebar-tab');
    if (!tab || tab.disabled) return;
    showSidebarTab(tab.dataset.tab);
  });
}

const saveContextBtn = document.getElementById('saveContextBtn');
if (saveContextBtn) {
  saveContextBtn.addEventListener('click', saveContext);
}

const contextPinAssetBtn = document.getElementById('contextPinAssetBtn');
if (contextPinAssetBtn) {
  contextPinAssetBtn.addEventListener('click', openVaultContextPicker);
}

const contextAddWebBtn = document.getElementById('contextAddWebBtn');
if (contextAddWebBtn) {
  contextAddWebBtn.addEventListener('click', addWebSource);
}

const contextPinNotionBtn = document.getElementById('contextPinNotionBtn');
if (contextPinNotionBtn) {
  contextPinNotionBtn.addEventListener('click', () => openExternalSourcePicker('notion'));
}

const contextPinClickUpBtn = document.getElementById('contextPinClickUpBtn');
if (contextPinClickUpBtn) {
  contextPinClickUpBtn.addEventListener('click', () => openExternalSourcePicker('clickup'));
}

const contextPinGDriveBtn = document.getElementById('contextPinGDriveBtn');
if (contextPinGDriveBtn) {
  contextPinGDriveBtn.addEventListener('click', () => openExternalSourcePicker('gdrive'));
}

const contextPinYouTubeBtn = document.getElementById('contextPinYouTubeBtn');
if (contextPinYouTubeBtn) {
  contextPinYouTubeBtn.addEventListener('click', () => {
    const url = prompt('Enter YouTube URL:');
    if (url) addIntegrationItem('youtube', url, url);
  });
}

// Estimate tokens (simple proxy: ~4 chars per token)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

async function updateContextUsage() {
  const name = document.getElementById('contextProjectName').value;
  const desc = document.getElementById('contextProjectDesc').value;
  const instructions = document.getElementById('contextActiveInstructions').value;
  
  let totalTokens = 0;
  totalTokens += estimateTokens(name);
  totalTokens += estimateTokens(desc);
  totalTokens += estimateTokens(instructions);

  // Database Weight (Estimate 500 tokens per table schema)
  const selectedTables = document.querySelectorAll('#contextTableList input[type="checkbox"]:checked');
  totalTokens += (selectedTables.length * 500);

  // Asset Weight (Estimate 1000 per pinned asset)
  const pinnedAssets = document.querySelectorAll('#contextPinnedAssets .context-item');
  totalTokens += (pinnedAssets.length * 1000);

  // Web Source Weight (Estimate 2000 per URL)
  const webSources = document.querySelectorAll('#contextWebList .context-item');
  totalTokens += (webSources.length * 2000);

  // External Integrations Weight (Estimate 3000 per item)
  const integrationItems = document.querySelectorAll('#contextNotionList .context-item, #contextClickUpList .context-item, #contextGDriveList .context-item, #contextYouTubeList .context-item');
  totalTokens += (integrationItems.length * 3000);

  const maxTokens = 200000; // Proxy for model limit
  const percentage = Math.min((totalTokens / maxTokens) * 100, 100);
  
  const bar = document.getElementById('contextUsageBar');
  const label = document.getElementById('contextUsageValue');
  
  if (bar && label) {
    bar.style.width = `${percentage}%`;
    label.textContent = `${(totalTokens / 1000).toFixed(1)}k / ${(maxTokens / 1000)}k tokens`;
    
    // Dynamic color
    bar.classList.remove('low', 'medium', 'high');
    if (percentage < 30) bar.classList.add('low');
    else if (percentage < 70) bar.classList.add('medium');
    else bar.classList.add('high');
  }
}

// Add listeners for real-time updates
['contextProjectName', 'contextProjectDesc', 'contextActiveInstructions'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateContextUsage);
});

async function saveContext() {
  const name = document.getElementById('contextProjectName').value;
  const desc = document.getElementById('contextProjectDesc').value;
  const instructions = document.getElementById('contextActiveInstructions').value;

  // Gather selected tables
  const selectedTables = [];
  document.querySelectorAll('#contextTableList input[type="checkbox"]:checked').forEach(cb => {
    selectedTables.push(cb.value);
  });

  // Gather pinned assets
  const pinnedAssetIds = Array.from(document.querySelectorAll('#contextPinnedAssets .context-item')).map(item => item.dataset.id);

  // Gather web sources
  const webSources = Array.from(document.querySelectorAll('#contextWebList .context-item')).map(item => item.dataset.url);

  // Gather external integrations
  const getItems = (id) => {
    const container = document.getElementById(id);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.context-item')).map(item => ({ id: item.dataset.id, title: item.dataset.title }));
  };
  
  const notionItems = getItems('contextNotionList');
  const clickupItems = getItems('contextClickUpList');
  const gdriveItems = getItems('contextGDriveList');
  const youtubeItems = getItems('contextYouTubeList');

  if (!currentChatId) {
    showAppError('Please select a chat to save context');
    return;
  }

  try {
    saveContextBtn.disabled = true;
    saveContextBtn.textContent = 'Saving...';
    
    await window.electronAPI.updateChat(currentChatId, {
      metadata: {
        project: { name, desc },
        instructions,
        database: { tables: selectedTables },
        assets: { pinnedIds: pinnedAssetIds },
        webSources,
        integrations: {
          notion: notionItems,
          clickup: clickupItems,
          gdrive: gdriveItems,
          youtube: youtubeItems
        }
      }
    });
    
    saveContextBtn.textContent = 'Updated!';
    updateContextUsage();
    setTimeout(() => {
      saveContextBtn.disabled = false;
      saveContextBtn.textContent = 'Update Context';
    }, 2000);
  } catch (err) {
    console.error('Save context failed:', err);
    showAppError('Failed to save context');
    saveContextBtn.disabled = false;
    saveContextBtn.textContent = 'Update Context';
  }
}

// Generic external source picker (Notion/ClickUp/GDrive)
async function openExternalSourcePicker(type) {
  const btnMap = { notion: 'contextPinNotionBtn', clickup: 'contextPinClickUpBtn', gdrive: 'contextPinGDriveBtn' };
  const btn = document.getElementById(btnMap[type]);
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const dropdown = document.createElement('div');
  dropdown.className = 'vault-picker-dropdown';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

  const labelMap = { notion: 'Notion Page', clickup: 'ClickUp List', gdrive: 'Google Drive File' };
  dropdown.innerHTML = `
    <div class="vault-picker-header">
      <div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--text-tertiary)">Select ${labelMap[type]}</div>
      <input type="text" class="vault-picker-search" placeholder="Search..." />
    </div>
    <div class="vault-picker-list"><div class="vault-picker-loading">Loading from Composio...</div></div>
  `;
  document.body.appendChild(dropdown);

  const listEl = dropdown.querySelector('.vault-picker-list');
  
  // Simulation: using Composio to fetch list
  setTimeout(() => {
    const mockItems = {
      notion: [{ id: 'n1', title: 'Brand Guidelines' }, { id: 'n2', title: 'Product Specs' }, { id: 'n3', title: 'Marketing Calendar' }],
      clickup: [{ id: 'c1', title: 'Engineering Sprint' }, { id: 'c2', title: 'Content Backlog' }, { id: 'c3', title: 'Bug Tracking' }],
      gdrive: [{ id: 'g1', title: 'Q1 Strategy.pdf' }, { id: 'g2', title: 'Financial Model.xlsx' }, { id: 'g3', title: 'Project Assets' }]
    };
    
    listEl.innerHTML = (mockItems[type] || []).map(item => `
      <div class="vault-picker-item" data-id="${item.id}" data-title="${item.title}">
        <div class="vault-picker-name">${escapeHtml(item.title)}</div>
      </div>
    `).join('');

    listEl.querySelectorAll('.vault-picker-item').forEach(el => {
      el.onclick = () => {
        const { id, title } = el.dataset;
        addIntegrationItem(type, id, title);
        dropdown.remove();
      };
    });
  }, 800);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

function addIntegrationItem(type, id, title) {
  const containerIdMap = { notion: 'contextNotionList', clickup: 'contextClickUpList', gdrive: 'contextGDriveList', youtube: 'contextYouTubeList' };
  const containerId = containerIdMap[type];
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const existing = Array.from(container.querySelectorAll('.context-item')).map(el => el.dataset.id);
  if (existing.includes(id)) return;

  if (container.querySelector('.empty-state')) container.innerHTML = '';

  const item = document.createElement('div');
  item.className = 'context-item';
  item.dataset.id = id;
  item.dataset.title = title;
  
  let iconHtml = '';
  if (type === 'notion') iconHtml = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>';
  else if (type === 'clickup') iconHtml = '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>';
  else if (type === 'gdrive') iconHtml = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
  else if (type === 'youtube') iconHtml = '<path d="M22.54 6.42a2.78 2.82 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.82 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.82 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.82 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>';

  item.innerHTML = `
    <svg style="width:14px;height:14px;color:var(--text-tertiary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${iconHtml}
    </svg>
    <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
    <button class="folder-action-btn" onclick="removeIntegrationItem('${type}', '${escapeHtml(id)}')" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  container.appendChild(item);
  updateContextUsage();
}

window.removeIntegrationItem = function(type, id) {
  const containerIdMap = { notion: 'contextNotionList', clickup: 'contextClickUpList', gdrive: 'contextGDriveList', youtube: 'contextYouTubeList' };
  const containerId = containerIdMap[type];
  const item = document.querySelector(`#${containerId} .context-item[data-id="${id}"]`);
  if (item) item.remove();
  
  const container = document.getElementById(containerId);
  if (container.querySelectorAll('.context-item').length === 0) {
    const labelMap = { notion: 'pages', clickup: 'lists', gdrive: 'files', youtube: 'videos' };
    container.innerHTML = `<div class="empty-state">No ${labelMap[type]} pinned</div>`;
  }
  updateContextUsage();
};

function addWebSource() {
  const input = document.getElementById('contextWebInput');
  const url = input.value.trim();
  if (!url) return;

  try {
    new URL(url); // Validate URL
  } catch (_) {
    showAppError('Please enter a valid URL (including https://)');
    return;
  }

  const container = document.getElementById('contextWebList');
  const existing = Array.from(container.querySelectorAll('.context-item')).map(el => el.dataset.url);
  
  if (existing.includes(url)) {
    input.value = '';
    return;
  }

  if (container.querySelector('.empty-state')) container.innerHTML = '';

  const item = document.createElement('div');
  item.className = 'context-item';
  item.dataset.url = url;
  item.innerHTML = `
    <svg style="width:14px;height:14px;color:var(--text-tertiary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
    <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${url}">${url}</span>
    <button class="folder-action-btn" onclick="removeWebSource('${url}')" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  container.appendChild(item);
  input.value = '';
  updateContextUsage();
}

window.removeWebSource = function(url) {
  const item = document.querySelector(`#contextWebList .context-item[data-url="${url}"]`);
  if (item) item.remove();
  if (document.querySelectorAll('#contextWebList .context-item').length === 0) {
    document.getElementById('contextWebList').innerHTML = '<div class="empty-state">No URLs added</div>';
  }
  updateContextUsage();
};

async function loadContextTables(selectedList = []) {
  const container = document.getElementById('contextTableList');
  if (!container) return;

  try {
    const access = await window.electronAPI.getDatabaseAccess();
    if (!access?.allowed) {
      container.innerHTML = '<div class="empty-state">Connect Supabase Admin to see tables</div>';
      return;
    }

    const { tables } = await window.electronAPI.getDatabaseTables();
    if (!tables || tables.length === 0) {
      container.innerHTML = '<div class="empty-state">No tables found</div>';
      return;
    }

    container.innerHTML = '';
    tables.forEach(table => {
      const item = document.createElement('div');
      item.className = 'context-item';
      
      const label = document.createElement('label');
      label.className = 'context-checkbox-label';
      
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = table.name;
      cb.checked = selectedList.includes(table.name);
      cb.addEventListener('change', updateContextUsage);
      
      const name = document.createElement('span');
      name.textContent = table.name;
      
      label.append(cb, name);
      item.appendChild(label);
      container.appendChild(item);
    });
    updateContextUsage();
  } catch (err) {
    console.error('Failed to load context tables:', err);
    container.innerHTML = '<div class="empty-state">Error loading tables</div>';
  }
}

function updateContextPanel(chat) {
  const meta = chat?.metadata || {};
  const project = meta.project || {};
  const db = meta.database || {};
  const assets = meta.assets || {};
  const integrations = meta.integrations || {};
  
  document.getElementById('contextProjectName').value = project.name || '';
  document.getElementById('contextProjectDesc').value = project.desc || '';
  document.getElementById('contextActiveInstructions').value = meta.instructions || '';
  
  // Update Context Bar
  const ctxProjectName = document.getElementById('ctxProjectName');
  if (ctxProjectName) {
    ctxProjectName.textContent = project.name || 'No Project';
    ctxProjectName.onclick = () => {
      showSidebarTab('context');
      if (!sidebar.classList.contains('visible')) toggleSidebar();
    };
  }
  
  const ctxDbPill = document.getElementById('ctxDbPill');
  const ctxDbCount = document.getElementById('ctxDbCount');
  if (ctxDbPill && ctxDbCount) {
    const tableCount = (db.tables || []).length;
    ctxDbCount.textContent = `${tableCount} Table${tableCount === 1 ? '' : 's'}`;
    ctxDbPill.classList.toggle('hidden', tableCount === 0);
    ctxDbPill.onclick = () => {
      showSidebarTab('context');
      if (!sidebar.classList.contains('visible')) toggleSidebar();
    };
  }

  loadContextTables(db.tables || []);
  renderPinnedAssets(assets.pinnedIds || []);
  renderWebSources(meta.webSources || []);
  renderIntegrationItems('notion', integrations.notion || []);
  renderIntegrationItems('clickup', integrations.clickup || []);
  renderIntegrationItems('gdrive', integrations.gdrive || []);
  renderIntegrationItems('youtube', integrations.youtube || []);
  updateContextUsage();
}

function renderIntegrationItems(type, items) {
  const containerIdMap = { notion: 'contextNotionList', clickup: 'contextClickUpList', gdrive: 'contextGDriveList', youtube: 'contextYouTubeList' };
  const containerId = containerIdMap[type];
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!items || items.length === 0) {
    const labelMap = { notion: 'pages', clickup: 'lists', gdrive: 'files', youtube: 'videos' };
    container.innerHTML = `<div class="empty-state">No ${labelMap[type]} pinned</div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'context-item';
    el.dataset.id = item.id;
    el.dataset.title = item.title;
    
    let iconHtml = '';
    if (type === 'notion') iconHtml = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>';
    else if (type === 'clickup') iconHtml = '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>';
    else if (type === 'gdrive') iconHtml = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
    else if (type === 'youtube') iconHtml = '<path d="M22.54 6.42a2.78 2.82 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.82 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.82 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.82 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>';

    el.innerHTML = `
      <svg style="width:14px;height:14px;color:var(--text-tertiary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${iconHtml}
      </svg>
      <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
      <button class="folder-action-btn" onclick="removeIntegrationItem('${type}', '${escapeHtml(item.id)}')" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    container.appendChild(el);
  });
}

function renderWebSources(urls) {
  const container = document.getElementById('contextWebList');
  if (!container) return;
  
  if (!urls || urls.length === 0) {
    container.innerHTML = '<div class="empty-state">No URLs added</div>';
    return;
  }

  container.innerHTML = '';
  urls.forEach(url => {
    const item = document.createElement('div');
    item.className = 'context-item';
    item.dataset.url = url;
    item.innerHTML = `
      <svg style="width:14px;height:14px;color:var(--text-tertiary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
      <span style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${url}">${url}</span>
      <button class="folder-action-btn" onclick="removeWebSource('${url}')" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    container.appendChild(item);
  });
}

async function renderPinnedAssets(assetIds) {
  const container = document.getElementById('contextPinnedAssets');
  if (!container) return;
  
  if (!assetIds || assetIds.length === 0) {
    container.innerHTML = '<div class="empty-state">No assets pinned</div>';
    return;
  }

  try {
    // We need to fetch asset details for these IDs
    // For now, let's just show the IDs or placeholders until we have a getAssetsByIds endpoint
    container.innerHTML = '';
    assetIds.forEach(id => {
      const item = document.createElement('div');
      item.className = 'context-item';
      item.dataset.id = id;
      item.innerHTML = `
        <svg style="width:14px;height:14px;color:var(--text-tertiary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
        </svg>
        <span style="flex:1;">Asset ${id.slice(0, 8)}...</span>
        <button class="folder-action-btn" onclick="unpinAsset('${id}')" title="Unpin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to render pinned assets:', err);
  }
}

window.unpinAsset = function(id) {
  const item = document.querySelector(`#contextPinnedAssets .context-item[data-id="${id}"]`);
  if (item) item.remove();
  if (document.querySelectorAll('#contextPinnedAssets .context-item').length === 0) {
    document.getElementById('contextPinnedAssets').innerHTML = '<div class="empty-state">No assets pinned</div>';
  }
};

// Open vault picker to pin an asset
async function openVaultContextPicker() {
  const api = window.electronAPI || window.webAPI;
  const btn = document.getElementById('contextPinAssetBtn');
  const rect = btn.getBoundingClientRect();

  const dropdown = document.createElement('div');
  dropdown.className = 'vault-picker-dropdown';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

  dropdown.innerHTML = `
    <div class="vault-picker-header">
      <input type="text" class="vault-picker-search" placeholder="Search to pin..." />
    </div>
    <div class="vault-picker-list"><div class="vault-picker-loading">Loading...</div></div>
  `;
  document.body.appendChild(dropdown);

  const listEl = dropdown.querySelector('.vault-picker-list');
  try {
    const result = await api.getVaultAssets({ limit: 50 });
    const assets = Array.isArray(result) ? result : (result.assets || []);
    
    listEl.innerHTML = assets.map(a => `
      <div class="vault-picker-item" data-id="${a.id}">
        <div class="vault-picker-name">${escapeHtml(a.display_name || a.file_name)}</div>
      </div>
    `).join('');

    listEl.querySelectorAll('.vault-picker-item').forEach(item => {
      item.onclick = () => {
        const id = item.dataset.id;
        // Add to pinned list if not already there
        const currentIds = Array.from(document.querySelectorAll('#contextPinnedAssets .context-item')).map(el => el.dataset.id);
        if (!currentIds.includes(id)) {
          renderPinnedAssets([...currentIds, id]);
        }
        dropdown.remove();
      };
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state">Error</div>';
  }

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

// DOM Elements - Left Sidebar (Chat History)
const chatHistoryList = document.getElementById('chatHistoryList');
const leftSidebar = document.getElementById('leftSidebar');
const leftSidebarToggle = document.getElementById('leftSidebarToggle');
const leftSidebarExpand = document.getElementById('leftSidebarExpand');
const navRail = document.querySelector('.nav-rail');

// DOM Elements - Settings
const settingsView = document.getElementById('settingsView');
const settingsBackBtn = document.getElementById('settingsBackBtn');
const settingsAnthropicKey = document.getElementById('settingsAnthropicKey');
const settingsComposioKey = document.getElementById('settingsComposioKey');
const settingsSmitheryKey = document.getElementById('settingsSmitheryKey');
const settingsAnthropicToggle = document.getElementById('settingsAnthropicToggle');
const settingsComposioToggle = document.getElementById('settingsComposioToggle');
const settingsSmitheryToggle = document.getElementById('settingsSmitheryToggle');
const settingsAnthropicMasked = document.getElementById('settingsAnthropicMasked');
const settingsComposioMasked = document.getElementById('settingsComposioMasked');
const settingsSmitheryMasked = document.getElementById('settingsSmitheryMasked');
const settingsPostizKey = document.getElementById('settingsPostizKey');
const settingsPostizToggle = document.getElementById('settingsPostizToggle');
const settingsPostizMasked = document.getElementById('settingsPostizMasked');
const settingsDataforseoUsername = document.getElementById('settingsDataforseoUsername');
const settingsDataforseoPassword = document.getElementById('settingsDataforseoPassword');
const settingsDataforseoUsernameToggle = document.getElementById('settingsDataforseoUsernameToggle');
const settingsDataforseoPasswordToggle = document.getElementById('settingsDataforseoPasswordToggle');
const settingsDataforseoUsernameMasked = document.getElementById('settingsDataforseoUsernameMasked');
const settingsDataforseoPasswordMasked = document.getElementById('settingsDataforseoPasswordMasked');
const settingsSaveKeysBtn = document.getElementById('settingsSaveKeysBtn');
const settingsKeysStatus = document.getElementById('settingsKeysStatus');
const settingsMcpList = document.getElementById('settingsMcpList');
const settingsAddMcpBtn = document.getElementById('settingsAddMcpBtn');
const settingsMcpForm = document.getElementById('settingsMcpForm');
const settingsMcpFormTitle = document.getElementById('settingsMcpFormTitle');
const settingsMcpName = document.getElementById('settingsMcpName');
const settingsMcpType = document.getElementById('settingsMcpType');
const settingsMcpUrl = document.getElementById('settingsMcpUrl');
const settingsMcpHeaders = document.getElementById('settingsMcpHeaders');
const settingsMcpCommand = document.getElementById('settingsMcpCommand');
const settingsMcpArgs = document.getElementById('settingsMcpArgs');
const settingsMcpHttpFields = document.getElementById('settingsMcpHttpFields');
const settingsMcpLocalFields = document.getElementById('settingsMcpLocalFields');
const settingsMcpCancelBtn = document.getElementById('settingsMcpCancelBtn');
const settingsMcpSaveBtn = document.getElementById('settingsMcpSaveBtn');
const settingsMcpStatus = document.getElementById('settingsMcpStatus');

// DOM Elements - Browser Settings
const settingsBrowserEnabled = document.getElementById('settingsBrowserEnabled');
const settingsBrowserOptions = document.getElementById('settingsBrowserOptions');
const settingsBrowserBackend = document.getElementById('settingsBrowserBackend');
const settingsAgentBrowserHint = document.getElementById('settingsAgentBrowserHint');
const settingsBrowserBuiltinOptions = document.getElementById('settingsBrowserBuiltinOptions');
const settingsBrowserMode = document.getElementById('settingsBrowserMode');
const settingsBrowserCdpPort = document.getElementById('settingsBrowserCdpPort');
const settingsCdpPortField = document.getElementById('settingsCdpPortField');
const settingsBrowserHeadless = document.getElementById('settingsBrowserHeadless');
const settingsSaveBrowserBtn = document.getElementById('settingsSaveBrowserBtn');
const settingsBrowserStatus = document.getElementById('settingsBrowserStatus');

// DOM Elements - Instructions Settings
const settingsGlobalInstructions = document.getElementById('settingsGlobalInstructions');
const settingsFolderInstructionsList = document.getElementById('settingsFolderInstructionsList');
const settingsAddFolderInstructionBtn = document.getElementById('settingsAddFolderInstructionBtn');
const settingsFolderInstructionForm = document.getElementById('settingsFolderInstructionForm');
const settingsFolderPath = document.getElementById('settingsFolderPath');
const settingsFolderInstructionsText = document.getElementById('settingsFolderInstructionsText');
const settingsFolderSaveBtn = document.getElementById('settingsFolderInstructionSaveBtn');
const settingsFolderCancelBtn = document.getElementById('settingsFolderInstructionCancelBtn');
const settingsSaveInstructionsBtn = document.getElementById('settingsSaveInstructionsBtn');
const settingsInstructionsStatus = document.getElementById('settingsInstructionsStatus');

// DOM Elements - Permission Settings
const settingsPermissionMode = document.getElementById('settingsPermissionMode');
const settingsAllowedDirectoriesList = document.getElementById('settingsAllowedDirectoriesList');
const settingsNewDirectoryPath = document.getElementById('settingsNewDirectoryPath');
const settingsAddDirectoryBtn = document.getElementById('settingsAddDirectoryBtn');
const settingsFileDeleteConfirmation = document.getElementById('settingsFileDeleteConfirmation');
const settingsSavePermissionsBtn = document.getElementById('settingsSavePermissionsBtn');
const settingsPermissionsStatus = document.getElementById('settingsPermissionsStatus');

// DOM Elements - Document Generation Settings
const settingsDocOutputDir = document.getElementById('settingsDocOutputDir');
const settingsSaveDocumentsBtn = document.getElementById('settingsSaveDocumentsBtn');
const settingsDocumentsStatus = document.getElementById('settingsDocumentsStatus');

// DOM Elements - Plugin Settings
const settingsPluginUrl = document.getElementById('settingsPluginUrl');
const settingsInstallPluginBtn = document.getElementById('settingsInstallPluginBtn');
const settingsPluginsStatus = document.getElementById('settingsPluginsStatus');
const settingsPluginsList = document.getElementById('settingsPluginsList');

// DOM Elements - Permission Dialog
const permissionDialogOverlay = document.getElementById('permissionDialogOverlay');
const permissionToolName = document.getElementById('permissionToolName');
const permissionToolInput = document.getElementById('permissionToolInput');
const permissionAllowBtn = document.getElementById('permissionAllowBtn');
const permissionDenyBtn = document.getElementById('permissionDenyBtn');

// DOM Elements - Vault
const vaultView = document.getElementById('vaultView');
const vaultBackBtn = document.getElementById('vaultBackBtn');
const vaultNewFolderBtn = document.getElementById('vaultNewFolderBtn');
const vaultUploadBtn = document.getElementById('vaultUploadBtn');
const vaultFileInput = document.getElementById('vaultFileInput');
const vaultBreadcrumbs = document.getElementById('vaultBreadcrumbs');
const vaultSourceFilter = document.getElementById('vaultSourceFilter');
const vaultSortSelect = document.getElementById('vaultSortSelect');
const vaultViewToggle = document.getElementById('vaultViewToggle');
const vaultContent = document.getElementById('vaultContent');
const vaultUnavailable = document.getElementById('vaultUnavailable');
const vaultGrid = document.getElementById('vaultGrid');
const vaultEmpty = document.getElementById('vaultEmpty');

// DOM Elements - Auth
const authView = document.getElementById('authView');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authDisplayName = document.getElementById('authDisplayName');
const authDisplayNameField = document.getElementById('authDisplayNameField');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const authInfo = document.getElementById('authInfo');
const authSkipBtn = document.getElementById('authSkipBtn');
const userEmailLabel = document.getElementById('userEmailLabel');

// DOM Elements - Search
const searchContainer = document.getElementById('searchContainer');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// DOM Elements - Artifact Panel
const artifactLangBadge = document.getElementById('artifactLangBadge');
const artifactTitle = document.getElementById('artifactTitle');
const artifactVersionInfo = document.getElementById('artifactVersionInfo');
const codeEditorWrap = document.getElementById('codeEditorWrap');
const codeEditor = document.getElementById('codeEditor');
const lineNumbers = document.getElementById('lineNumbers');
const docEditorWrap = document.getElementById('docEditorWrap');
const docEditor = document.getElementById('docEditor');
const docToolbar = document.getElementById('docToolbar');
const artifactCopyBtn = document.getElementById('artifactCopyBtn');
const artifactDownloadBtn = document.getElementById('artifactDownloadBtn');
const artifactUndoBtn = document.getElementById('artifactUndoBtn');
const artifactRedoBtn = document.getElementById('artifactRedoBtn');
const selectionToolbar = document.getElementById('selectionToolbar');

// Auth state
let authMode = 'signin'; // 'signin' or 'signup'
let isAuthEnabled = false; // true if Supabase is configured

// State
let isFirstMessage = true;
let todos = [];
let toolCalls = [];
let activeSubagents = new Map(); // agentId → { type, description, startTime, currentTool, elapsedSeconds }
let attachedFiles = [];
let selectedProvider = 'claude';
let selectedModel = 'claude-sonnet-4-5-20250514';
let thinkingMode = 'normal'; // 'normal' or 'extended'
let isWaitingForResponse = false;

let activeBrowserSession = null; // { url: string, sessionId: string, inlineElement: HTMLElement }
let browserDisplayMode = 'hidden'; // 'inline' | 'sidebar' | 'hidden'

// Artifact state
const artifactStore = new Map();
let activeArtifactId = null;
let artifactCounter = 0;

// Multi-chat state
let allChats = [];
let allJobs = [];
let allReports = [];
let currentChatId = null;
let currentFolderType = 'chat'; // 'chat' | 'job' | 'report'

// Main view state (home | chat | settings)
let currentMainView = 'home';
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'currentMainView', {
    get: () => currentMainView,
    set: (value) => {
      currentMainView = value;
    },
    configurable: true,
  });
}
let lastViewBeforeSettings = 'home';
// Cached settings for MCP list (from GET /api/settings)
let cachedSettings = { apiKeys: {}, mcpServers: [] };
let settingsMcpEditingId = null; // id when editing an MCP entry, null when adding
let appErrorTimer = null;

// Model configurations per provider
const providerModels = {
  claude: [
    { value: 'claude-opus-4-5-20250514', label: 'Claude Opus 4.5', desc: 'Most capable for complex work' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', desc: 'Best for everyday tasks', default: true },
    { value: 'claude-haiku-4-5-20250514', label: 'Claude Haiku 4.5', desc: 'Fastest for quick answers' }
  ]
};

// Initialize
async function init() {
  updateGreeting();
  setupEventListeners();
  setupAuthListeners();
  initArtifactPanel();
  setupCommandPalette();

  // Check backend health banner
  const banner = document.getElementById('backendBanner');
  const dismissBtn = document.getElementById('backendBannerDismiss');
  if (banner && window.electronAPI && typeof window.electronAPI.checkBackend === 'function') {
    const ok = await checkBackendWithRetry(10, 500);
    if (!ok) banner.classList.remove('hidden');
    if (dismissBtn) dismissBtn.addEventListener('click', () => banner.classList.add('hidden'));
  }

  // Initialize auth — gate the app on auth state
  if (window.appAuth) {
    window.appAuth.initAuth((session, meta) => {
      if (meta?.error) {
        isAuthEnabled = true;
        showAuthView();
        showAuthError(meta.error);
        return;
      }
      isAuthEnabled = true;
      onAuthReady(session);
    });
  } else {
    isAuthEnabled = true;
    showAuthView();
    showAuthError('Authentication module is unavailable. Reloading may fix this issue.');
  }
}

// Called when auth is initialized (session may be null)
function onAuthReady(session) {
  if (session) {
    showAppAfterAuth(session);
    showView('home');
  } else {
    showAuthView();
  }
}

// Show the auth view
function showAuthView() {
  if (authView) {
    authView.classList.remove('hidden');
    if (navRail) {
      navRail.classList.add('hidden');
    }
    homeView.classList.add('hidden');
    chatView.classList.add('hidden');
    if (leftSidebar) leftSidebar.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    const dbView = document.getElementById('dbView');
    if (dbView) dbView.classList.add('hidden');
    const reportsView = document.getElementById('reportsView');
    if (reportsView) reportsView.classList.add('hidden');
    const jobsView = document.getElementById('jobsView');
    if (jobsView) jobsView.classList.add('hidden');
    if (vaultView) vaultView.classList.add('hidden');
    if (sidebar) sidebar.classList.add('hidden');
    if (rightSidebarExpand) rightSidebarExpand.classList.add('hidden');
    hideAuthMessages();
  }
}

// Show the app after successful auth
function showAppAfterAuth(session) {
  if (authView) authView.classList.add('hidden');
  if (navRail) {
    navRail.classList.remove('hidden');
  }
  hideAuthMessages();
  if (leftSidebar) leftSidebar.classList.remove('hidden');

  // Update user display
  const user = session?.user;
  if (userEmailLabel && user) {
    userEmailLabel.textContent = user.email || '';
  }
  const navSignOutBtn = document.getElementById('navSignOutBtn');
  if (navSignOutBtn) {
    navSignOutBtn.classList.remove('hidden');
  }

  // Show Account section in Settings
  const settingsAccountSection = document.getElementById('settingsAccountSection');
  if (settingsAccountSection) {
    settingsAccountSection.style.display = '';
    const userInfoEl = document.getElementById('settingsUserInfo');
    if (userInfoEl && user) userInfoEl.textContent = user.email || '';
  }

  // Show search bar when authenticated with API
  if (searchContainer && useApi()) {
    searchContainer.classList.remove('hidden');
    setupSearchListeners();
  }

  // Check if user has database admin access
  const navDbBtn = document.getElementById('navDbBtn');
  if (navDbBtn && window.electronAPI?.getDatabaseAccess) {
    window.electronAPI.getDatabaseAccess().then(result => {
      if (result?.allowed) navDbBtn.classList.remove('hidden');
    }).catch(() => {});
  }

  // Load chats (from API if Supabase, else localStorage)
  loadAllChats();
  loadChatFolders();
  renderChatHistory();

  // Migrate localStorage to Supabase on first login
  if (user && !localStorage.getItem('supabase_migrated')) {
    migrateLocalStorageToSupabase();
  }

  homeInput.focus();
}

// ==================== FOLDERS LOGIC ====================
let chatFolders = [];
let workflowFolders = [];
let reportFolders = [];
let folderOpenState = new Set(); // Set of folder IDs that are expanded

async function loadFolders(type = 'chat') {
  if (!useApi()) return;
  try {
    const folders = await window.electronAPI.getFolders(type);
    const list = Array.isArray(folders) ? folders : (folders.data || []);
    if (type === 'chat') {
      chatFolders = list;
      renderChatFolders();
    } else if (type === 'job') {
      workflowFolders = list;
      renderWorkflowFolders();
    } else if (type === 'report') {
      reportFolders = list;
      renderReportFolders();
    }
  } catch (err) {
    console.error(`Failed to load ${type} folders:`, err);
  }
}

async function loadChatFolders() {
  await loadFolders('chat');
}

function renderChatFolders() {
  renderFolders('chat', 'chatFoldersList', chatFolders, allChats, buildChatHistoryItem);
}

function renderWorkflowFolders() {
  renderFolders('job', 'workflowFoldersList', workflowFolders, allJobs, buildWorkflowHistoryItem);
}

function renderReportFolders() {
  renderFolders('report', 'reportFoldersList', reportFolders, allReports, buildReportHistoryItem);
}

function renderFolders(type, containerId, folders, items, buildItemFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const rootFolders = folders.filter(f => !f.parent_id);
  
  rootFolders.forEach(folder => {
    const folderEl = document.createElement('div');
    folderEl.className = 'folder-wrapper';
    
    const isOpen = folderOpenState.has(folder.id);
    
    const item = document.createElement('div');
    item.className = 'folder-item' + (isOpen ? ' open' : '');
    item.dataset.id = folder.id;
    item.draggable = true;
    
    const icon = document.createElement('div');
    icon.className = 'folder-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name;
    
    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    
    const renameBtn = document.createElement('button');
    renameBtn.className = 'folder-action-btn';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
    renameBtn.onclick = (e) => { e.stopPropagation(); renameFolder(folder.id, folder.name, type); };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-action-btn';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folder.id, type); };
    
    actions.append(renameBtn, deleteBtn);
    item.append(icon, name, actions);
    
    item.addEventListener('click', () => toggleFolder(folder.id, type));
    item.addEventListener('dragover', handleFolderDragOver);
    item.addEventListener('dragleave', handleFolderDragLeave);
    item.addEventListener('drop', (e) => handleFolderDrop(e, folder.id, type));
    
    folderEl.appendChild(item);
    
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'folder-children';
    if (isOpen) {
      const itemsInFolder = items.filter(i => i.folder_id === folder.id);
      itemsInFolder.forEach(itemData => {
        const itemEl = buildItemFn(itemData);
        childrenContainer.appendChild(itemEl);
      });
      if (itemsInFolder.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-history-empty';
        empty.style.padding = '4px 8px';
        empty.style.fontSize = '11px';
        empty.textContent = 'Empty';
        childrenContainer.appendChild(empty);
      }
    }
    
    folderEl.appendChild(childrenContainer);
    container.appendChild(folderEl);
  });
}

async function createFolder(type) {
  const label = type === 'job' ? 'Workflow' : type.charAt(0).toUpperCase() + type.slice(1);
  const name = prompt(`${label} Folder Name:`);
  if (!name) return;
  try {
    await window.electronAPI.createFolder(name, type);
    loadFolders(type);
  } catch (err) {
    console.error('Create folder failed:', err);
  }
}

async function createChatFolder() {
  await createFolder('chat');
}

async function renameFolder(id, oldName, type) {
  const newName = prompt('Rename folder:', oldName);
  if (!newName || newName === oldName) return;
  try {
    await window.electronAPI.renameFolder(id, newName);
    loadFolders(type);
  } catch (err) {
    console.error('Rename folder failed:', err);
  }
}

async function deleteFolder(id, type) {
  if (!confirm('Delete folder? Items inside will be moved to root.')) return;
  try {
    await window.electronAPI.deleteFolder(id);
    loadFolders(type);
    if (type === 'chat') {
      loadAllChats();
    } else if (type === 'job') {
      loadJobs();
    } else if (type === 'report') {
      loadSavedReports();
    }
  } catch (err) {
    console.error('Delete folder failed:', err);
  }
}

function toggleFolder(id, type) {
  if (folderOpenState.has(id)) {
    folderOpenState.delete(id);
  } else {
    folderOpenState.add(id);
  }
  if (type === 'chat') renderChatFolders();
  else if (type === 'job') renderWorkflowFolders();
  else if (type === 'report') renderReportFolders();
}

// Drag & Drop Handlers
function handleFolderDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleFolderDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleFolderDrop(e, folderId, type) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const itemId = e.dataTransfer.getData(`text/${type}-id`);
  if (!itemId) return;
  
  try {
    if (type === 'chat') {
      const chat = allChats.find(c => c.id === itemId);
      if (chat) chat.folder_id = folderId;
      renderChatFolders();
      renderChatHistory();
      await window.electronAPI.updateChat(itemId, { folder_id: folderId });
    } else if (type === 'job') {
      const job = allJobs.find(j => j.id === itemId);
      if (job) job.folder_id = folderId;
      renderWorkflowFolders();
      loadJobs(); 
      await window.electronAPI.updateJob(itemId, { folder_id: folderId });
    } else if (type === 'report') {
      const report = allReports.find(r => r.id === itemId);
      if (report) report.folder_id = folderId;
      renderReportFolders();
      loadSavedReports();
      await window.electronAPI.updateSavedReport(itemId, { folder_id: folderId });
    }
  } catch (err) {
    console.error(`Move ${type} failed:`, err);
    if (type === 'chat') loadAllChats();
    else if (type === 'job') loadJobs();
    else if (type === 'report') loadSavedReports();
  }
}

function buildChatHistoryItem(chat) {
  const item = document.createElement('div');
  item.className = 'chat-history-item' + (chat.id === currentChatId ? ' active' : '');
  item.draggable = true;
  item.dataset.id = chat.id;
  
  const safeTitle = escapeHtml(chat.title || 'New chat');
  item.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="chat-title">${safeTitle}</span>
    <button class="delete-chat-btn" type="button" title="Delete" aria-label="Delete chat ${safeTitle}"></button>
  `;
  
  const deleteBtn = item.querySelector('.delete-chat-btn');
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  deleteBtn.addEventListener('click', (event) => deleteChat(chat.id, event));
  
  item.onclick = (e) => {
    if (!e.target.closest('.delete-chat-btn')) switchToChat(chat.id);
  };
  
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/chat-id', chat.id);
    item.classList.add('dragging');
  });
  
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
  });
  
  return item;
}

function buildWorkflowHistoryItem(job) {
  const item = document.createElement('div');
  item.className = 'chat-history-item';
  item.draggable = true;
  item.dataset.id = job.id;
  
  const safeName = escapeHtml(job.name || 'Untitled Workflow');
  item.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
    <span class="chat-title">${safeName}</span>
  `;
  
  item.onclick = () => {
    showView('jobs');
    // For now just switching view, could highlight later
  };
  
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/job-id', job.id);
    item.classList.add('dragging');
  });
  
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
  });
  
  return item;
}

function buildReportHistoryItem(report) {
  const item = document.createElement('div');
  item.className = 'chat-history-item';
  item.draggable = true;
  item.dataset.id = report.id;
  
  const safeName = escapeHtml(report.name || 'Untitled Report');
  item.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
    <span class="chat-title">${safeName}</span>
  `;
  
  item.onclick = () => {
    showView('reports');
    openSavedReport(report.id);
  };
  
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/report-id', report.id);
    item.classList.add('dragging');
  });
  
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
  });
  
  return item;
}

// Setup auth form listeners
function setupAuthListeners() {
  if (!authForm) return;

  // Tab switching
  const authForgotPasswordBtn = document.getElementById('authForgotPasswordBtn');
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      authMode = tab.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === authMode));
      authSubmitBtn.textContent = authMode === 'signup' ? 'Sign Up' : 'Sign In';
      if (authDisplayNameField) {
        authDisplayNameField.classList.toggle('hidden', authMode !== 'signup');
      }
      if (authForgotPasswordBtn) authForgotPasswordBtn.classList.toggle('hidden', authMode !== 'signin');
      hideAuthMessages();
    });
  });
  if (authForgotPasswordBtn) authForgotPasswordBtn.classList.toggle('hidden', authMode !== 'signin');

  // Forgot password
  if (authForgotPasswordBtn) {
    authForgotPasswordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      hideAuthMessages();
      const email = authEmail?.value?.trim();
      if (!email) {
        showAuthError('Enter your email first.');
        return;
      }
      authForgotPasswordBtn.disabled = true;
      try {
        await window.appAuth.resetPassword(email);
        showAuthInfo('Check your email for the reset link.');
      } catch (err) {
        showAuthError(err.message || 'Failed to send reset link.');
      } finally {
        authForgotPasswordBtn.disabled = false;
      }
    });
  }

  // Form submit
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthMessages();
    const submitLabel = authMode === 'signup' ? 'Sign Up' : 'Sign In';
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = authMode === 'signup' ? 'Signing up…' : 'Signing in…';

    try {
      if (authMode === 'signup') {
        await window.appAuth.signUp(authEmail.value, authPassword.value, authDisplayName?.value);
        showAuthInfo('Check your email to confirm your account, then sign in.');
      } else {
        const data = await window.appAuth.signIn(authEmail.value, authPassword.value);
        showAppAfterAuth(data.session);
      }
    } catch (err) {
      showAuthError(err.message);
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = submitLabel;
    }
  });

  // Skip auth is intentionally disabled — all users must authenticate.
  if (authSkipBtn) {
    authSkipBtn.classList.add('hidden');
  }

  // Sign out
  const legacySignoutBtn = document.getElementById('signoutSidebarBtn');
  if (legacySignoutBtn) {
    legacySignoutBtn.addEventListener('click', handleSignOut);
  }
}

function showAuthError(msg) {
  if (authError) { authError.textContent = msg; authError.classList.remove('hidden'); }
}
function showAuthInfo(msg) {
  if (authInfo) { authInfo.textContent = msg; authInfo.classList.remove('hidden'); }
}
function hideAuthMessages() {
  if (authError) authError.classList.add('hidden');
  if (authInfo) authInfo.classList.add('hidden');
}

async function handleSignOut() {
  if (!window.appAuth) return;

  try {
    await window.appAuth.signOut();
  } catch (err) {
    console.error('Sign out failed:', err);
  }

  allChats = [];
  currentChatId = null;
  chatMessages.textContent = '';
  renderChatHistory();

  const navSignOutBtn = document.getElementById('navSignOutBtn');
  if (navSignOutBtn) {
    navSignOutBtn.classList.add('hidden');
  }

  if (userEmailLabel) {
    userEmailLabel.textContent = '';
  }

  showAuthView();
  showAuthError('You have been signed out.');
}

function showAppError(message, timeoutMs = 5000) {
  const msg = message ? String(message) : 'An unexpected error occurred.';
  let toast = document.getElementById('appErrorToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appErrorToast';
    toast.className = 'app-toast hidden';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.classList.remove('hidden', 'success');
  toast.setAttribute('role', 'alert');

  if (appErrorTimer) clearTimeout(appErrorTimer);
  appErrorTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, timeoutMs);
}

function showAppSuccess(message, timeoutMs = 5000) {
  const msg = message ? String(message) : 'Done.';
  let toast = document.getElementById('appErrorToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appErrorToast';
    toast.className = 'app-toast hidden';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('success');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  if (appErrorTimer) clearTimeout(appErrorTimer);
  appErrorTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, timeoutMs);
}

// One-time migration of localStorage chats to Supabase
async function migrateLocalStorageToSupabase() {
  try {
    const saved = localStorage.getItem('allChats');
    if (!saved) {
      localStorage.setItem('supabase_migrated', 'true');
      return;
    }
    const localChats = JSON.parse(saved);
    if (!localChats.length) {
      localStorage.setItem('supabase_migrated', 'true');
      return;
    }

    console.log('[Migration] Migrating', localChats.length, 'chats to Supabase');
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const base = apiBase();

    for (const chat of localChats) {
      try {
        // Create the chat
        await fetch(base + '/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: chat.id, title: chat.title, provider: chat.provider, model: chat.model })
        });

        // Add messages
        for (const msg of (chat.messages || [])) {
          const role = msg.class?.includes('user') ? 'user' : 'assistant';
          await fetch(base + '/api/messages', {
            method: 'POST',
            headers,
            body: JSON.stringify({ chatId: chat.id, role, content: msg.content, html: msg.html || '' })
          });
        }
      } catch (err) {
        console.error('[Migration] Error migrating chat', chat.id, err);
      }
    }

    localStorage.setItem('supabase_migrated', 'true');
    console.log('[Migration] Complete');

    // Reload chats from API
    loadAllChats();
    renderChatHistory();
  } catch (err) {
    console.error('[Migration] Failed:', err);
  }
}

function generateId() {
  return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper: get auth headers for API calls
function getAuthHeaders() {
  if (window.appAuth && window.appAuth.getAuthHeaders) {
    return window.appAuth.getAuthHeaders();
  }
  if (window.electronAPI && typeof window.electronAPI.getAuthToken === 'function') {
    const token = window.electronAPI.getAuthToken();
    if (token) {
      return { 'Authorization': 'Bearer ' + token };
    }
  }
  return {};
}

// Helper: build API base URL
function apiBase() {
  return window._apiBase || '';
}

// Helper: check if we should use API (Supabase) for persistence
function useApi() {
  return isAuthEnabled && window.appAuth && window.appAuth.isAuthenticated();
}

function shouldShowAuthRequiredUnavailable() {
  return isAuthEnabled && !useApi();
}

async function checkBackendWithRetry(retries = 8, delayMs = 500) {
  if (!window.electronAPI || typeof window.electronAPI.checkBackend !== 'function') return false;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const ok = await window.electronAPI.checkBackend();
      if (ok) return true;
    } catch (_) {
      // swallow and retry
    }
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}

// Save current chat state
function saveState() {
  if (!currentChatId) return;

  if (isWaitingForResponse) {
    console.log('[Save] Skipping save during streaming');
    return;
  }

  const chatData = {
    id: currentChatId,
    title: chatTitle.textContent,
    messages: Array.from(chatMessages.children).map(msg => {
      const contentDiv = msg.querySelector('.message-content');
      const rawContent = contentDiv?.dataset.rawContent || contentDiv?.textContent || '';
      return {
        class: msg.className,
        content: rawContent,
        html: contentDiv?.innerHTML || ''
      };
    }),
    todos,
    toolCalls,
    artifacts: serializeArtifacts(),
    provider: selectedProvider,
    model: selectedModel,
    updatedAt: Date.now()
  };

  // Update local allChats array
  const index = allChats.findIndex(c => c.id === currentChatId);
  if (index >= 0) {
    allChats[index] = chatData;
  } else {
    allChats.unshift(chatData);
  }

  // Persist: API if authenticated, otherwise localStorage
  if (useApi()) {
    fetch(apiBase() + '/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ id: currentChatId, title: chatData.title, provider: selectedProvider, model: selectedModel })
    }).catch(err => console.error('[Save] API error:', err));
  } else {
    localStorage.setItem('allChats', JSON.stringify(allChats));
  }

  localStorage.setItem('currentChatId', currentChatId);
  localStorage.setItem('selectedProvider', selectedProvider);
  localStorage.setItem('selectedModel', selectedModel);

  renderChatHistory();
}

// Load all chats — from API if authenticated, else localStorage
function loadAllChats() {
  // Restore global provider/model settings from localStorage (always)
  const savedProvider = localStorage.getItem('selectedProvider');
  const savedModel = localStorage.getItem('selectedModel');
  if (savedProvider && providerModels[savedProvider]) {
    selectedProvider = savedProvider;
    updateProviderUI(savedProvider);
  }
  if (savedModel) {
    selectedModel = savedModel;
    const models = providerModels[selectedProvider] || [];
    const modelInfo = models.find(m => m.value === savedModel);
    if (modelInfo) {
      document.querySelectorAll('.model-selector .model-label').forEach(l => {
        l.textContent = modelInfo.label;
      });
    }
  }

  if (useApi()) {
    // Load from Supabase via API
    fetch(apiBase() + '/api/chats', {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        allChats = (data.chats || []).map(c => ({
          id: c.id,
          title: c.title,
          provider: c.provider,
          model: c.model,
          updatedAt: new Date(c.updated_at).getTime(),
          messages: [], // lazy-loaded on click
          todos: [],
          toolCalls: []
        }));
        renderChatHistory();

        // Restore current chat
        currentChatId = localStorage.getItem('currentChatId');
        if (currentChatId) {
          const chat = allChats.find(c => c.id === currentChatId);
          if (chat) loadChat(chat);
        }
      })
      .catch(err => {
        console.error('[LoadChats] API error, falling back to localStorage:', err);
        loadAllChatsFromLocalStorage();
      });
  } else {
    loadAllChatsFromLocalStorage();
  }
}

// Fallback: load from localStorage
function loadAllChatsFromLocalStorage() {
  try {
    const saved = localStorage.getItem('allChats');
    allChats = saved ? JSON.parse(saved) : [];
    currentChatId = localStorage.getItem('currentChatId');

    if (currentChatId) {
      const chat = allChats.find(c => c.id === currentChatId);
      if (chat) {
        loadChat(chat);
      } else {
        currentChatId = null;
        localStorage.removeItem('currentChatId');
      }
    }
  } catch (err) {
    console.error('Failed to load chats:', err);
    allChats = [];
  }
}

// ==================== COMMAND PALETTE LOGIC ====================
let paletteSelectedIndex = -1;
let paletteResults = [];

function setupCommandPalette() {
  const palette = document.getElementById('commandPalette');
  const input = document.getElementById('commandPaletteInput');
  const resultsContainer = document.getElementById('commandPaletteResults');

  if (!palette || !input) return;

  // Global shortcut: Cmd+K or Ctrl+K
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
    if (e.key === 'Escape' && !palette.classList.contains('hidden')) {
      toggleCommandPalette(false);
    }
  });

  input.addEventListener('input', () => {
    const query = input.value.trim();
    performPaletteSearch(query);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      movePaletteSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      movePaletteSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = resultsContainer.querySelector('.result-item.selected');
      if (selected) selected.click();
    }
  });

  // Close when clicking overlay
  palette.addEventListener('click', (e) => {
    if (e.target === palette) toggleCommandPalette(false);
  });
}

function toggleCommandPalette(show) {
  const palette = document.getElementById('commandPalette');
  const input = document.getElementById('commandPaletteInput');
  
  const isVisible = !palette.classList.contains('hidden');
  const shouldShow = show !== undefined ? show : !isVisible;

  palette.classList.toggle('hidden', !shouldShow);
  if (shouldShow) {
    input.value = '';
    performPaletteSearch(''); // Initial load: show commands
    input.focus();
  }
}

async function performPaletteSearch(query) {
  const results = [];
  
  // 1. Navigation Commands (Always shown if query is empty or starts with /)
  if (!query || query.startsWith('/')) {
    const cmdQuery = query.startsWith('/') ? query.slice(1) : query;
    const navs = [
      { type: 'nav', title: 'Home', subtitle: 'Go to overview', view: 'home', icon: 'home' },
      { type: 'nav', title: 'Vault', subtitle: 'View assets & files', view: 'vault', icon: 'folder' },
      { type: 'nav', title: 'Reports', subtitle: 'Usage & analytics', view: 'reports', icon: 'bar-chart' },
      { type: 'nav', title: 'Workflows', subtitle: 'Scheduled automations', view: 'jobs', icon: 'clock' },
      { type: 'nav', title: 'Settings', subtitle: 'Keys & configuration', view: 'settings', icon: 'settings' }
    ];
    results.push(...navs.filter(n => n.title.toLowerCase().includes(cmdQuery.toLowerCase())));
  }

  // 2. Chat Search
  if (query.length > 1) {
    const matchingChats = allChats.filter(c => c.title?.toLowerCase().includes(query.toLowerCase()));
    results.push(...matchingChats.slice(0, 5).map(c => ({
      type: 'chat',
      id: c.id,
      title: c.title || 'Untitled Chat',
      subtitle: `Last updated: ${new Date(c.updatedAt).toLocaleDateString()}`,
      icon: 'message-square'
    })));
  }

  // 3. Vault Search (Only if API available)
  if (query.length > 1 && useApi()) {
    try {
      const vaultRes = await window.electronAPI.getVaultAssets({ limit: 5 });
      const assets = Array.isArray(vaultRes) ? vaultRes : (vaultRes.assets || []);
      results.push(...assets.filter(a => (a.display_name || a.file_name).toLowerCase().includes(query.toLowerCase())).map(a => ({
        type: 'asset',
        id: a.id,
        title: a.display_name || a.file_name,
        subtitle: `In Vault \u00B7 ${a.file_type}`,
        icon: 'file'
      })));
    } catch (_) {}
  }

  paletteResults = results;
  renderPaletteResults(results);
}

function renderPaletteResults(results) {
  const container = document.getElementById('commandPaletteResults');
  if (!container) return;
  
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">No results found</div>';
    paletteSelectedIndex = -1;
    return;
  }

  // Group results
  const groups = {
    nav: { label: 'Navigation', items: [] },
    chat: { label: 'Chats', items: [] },
    asset: { label: 'Assets', items: [] }
  };

  results.forEach(r => {
    if (groups[r.type]) groups[r.type].items.push(r);
  });

  let html = '';
  let globalIndex = 0;
  
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.items.length === 0) return;
    
    html += `<div class="result-group-header">${group.label}</div>`;
    group.items.forEach(item => {
      html += `
        <div class="result-item" data-index="${globalIndex}" onclick="executePaletteAction(${globalIndex})">
          <div class="result-icon">
            ${getPaletteIcon(item.icon)}
          </div>
          <div class="result-info">
            <div class="result-title">${escapeHtml(item.title)}</div>
            <div class="result-subtitle">${escapeHtml(item.subtitle)}</div>
          </div>
        </div>
      `;
      globalIndex++;
    });
  });

  container.innerHTML = html;
  movePaletteSelection(0); // Select first item
}

function movePaletteSelection(dir) {
  const items = document.querySelectorAll('.result-item');
  if (items.length === 0) return;

  paletteSelectedIndex += dir;
  if (paletteSelectedIndex < 0) paletteSelectedIndex = items.length - 1;
  if (paletteSelectedIndex >= items.length) paletteSelectedIndex = 0;

  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === paletteSelectedIndex);
    if (idx === paletteSelectedIndex) item.scrollIntoView({ block: 'nearest' });
  });
}

window.executePaletteAction = function(index) {
  const action = paletteResults[index];
  if (!action) return;

  toggleCommandPalette(false);

  if (action.type === 'nav') {
    showView(action.view);
  } else if (action.type === 'chat') {
    switchToChat(action.id);
  } else if (action.type === 'asset') {
    showView('vault');
    // We could potentially auto-select or open the asset here
  }
};

function getPaletteIcon(iconName) {
  const icons = {
    'home': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    'check-square': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
    'folder': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
    'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-1.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h1.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v1.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-1.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    'message-square': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    'file': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>'
  };
  return icons[iconName] || '';
}

// Update provider UI across all dropdowns
function updateProviderUI(provider) {
  const providerLabel = providerModels[provider]?.length ? 'Claude' : 'Claude';
  document.querySelectorAll('.provider-selector .provider-label').forEach(l => {
    l.textContent = providerLabel;
  });
  document.querySelectorAll('.provider-menu .dropdown-item').forEach(item => {
    const isSelected = item.dataset.value === provider;
    item.classList.toggle('selected', isSelected);
    const checkIcon = item.querySelector('.check-icon');
    if (checkIcon) {
      checkIcon.style.display = isSelected ? 'block' : 'none';
    }
  });
  // Update model dropdown for the provider
  updateModelDropdowns(provider);
}

// Load a specific chat
function loadChat(chat) {
  currentChatId = chat.id;
  chatTitle.textContent = chat.title;
  isFirstMessage = false;
  todos = chat.todos || [];
  toolCalls = chat.toolCalls || [];
  clearArtifacts();
  if (chat.artifacts) restoreArtifacts(chat.artifacts);
  
  // Update Context Panel
  updateContextPanel(chat);

  // Restore provider/model for this chat
  if (chat.provider && providerModels[chat.provider]) {
    selectedProvider = chat.provider;
    updateProviderUI(chat.provider);
  }
  if (chat.model) {
    selectedModel = chat.model;
    const models = providerModels[selectedProvider] || [];
    const modelInfo = models.find(m => m.value === chat.model);
    if (modelInfo) {
      document.querySelectorAll('.model-selector .model-label').forEach(l => {
        l.textContent = modelInfo.label;
      });
      document.querySelectorAll('.model-menu .dropdown-item').forEach(item => {
        const isSelected = item.dataset.value === chat.model;
        item.classList.toggle('selected', isSelected);
        const checkIcon = item.querySelector('.check-icon');
        if (checkIcon) {
          checkIcon.style.display = isSelected ? 'block' : 'none';
        }
      });
    }
  }

  switchToChatView();

  // If chat has no messages loaded and we're using API, fetch from server
  if (useApi() && (!chat.messages || chat.messages.length === 0)) {
    chatMessages.textContent = '';
    fetch(apiBase() + '/api/chats/' + chat.id, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
    })
      .then(r => r.json())
      .then(data => {
        const messages = (data.messages || []).map(m => ({
          class: 'message ' + m.role,
          content: m.content,
          html: m.html || ''
        }));
        renderChatMessages(messages);
      })
      .catch(err => {
        console.error('[LoadChat] API error:', err);
        renderChatMessages(chat.messages || []);
      });
  } else {
    renderChatMessages(chat.messages || []);
  }

  renderTodos();
  scrollToBottom();
  renderChatHistory();
  localStorage.setItem('currentChatId', currentChatId);
}

// Render messages into the chat container
function renderChatMessages(messages) {
  chatMessages.textContent = '';
  const injectedArtifactIds = new Set();
  messages.forEach(msgData => {
    const messageDiv = document.createElement('div');
    messageDiv.className = msgData.class;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.dataset.rawContent = msgData.content;

    if (msgData.class.includes('user')) {
      contentDiv.textContent = msgData.content;
    } else if (msgData.class.includes('assistant')) {
      if (msgData.html) {
        contentDiv.innerHTML = sanitizeHtml(msgData.html);
      } else {
        renderMarkdown(contentDiv);
      }
    }

    messageDiv.appendChild(contentDiv);

    if (msgData.class.includes('assistant')) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.title = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy assistant message');
      copyBtn.addEventListener('click', () => copyMessage(copyBtn));
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      actionsDiv.appendChild(copyBtn);
      messageDiv.appendChild(actionsDiv);
    }

    chatMessages.appendChild(messageDiv);

    // Re-inject artifact pills for assistant messages with code blocks
    if (msgData.class.includes('assistant') && contentDiv.dataset.rawContent) {
      // Check if artifacts were already restored from saved state
      const restoredArts = [...artifactStore.values()].filter(a =>
        a.versions[0] && contentDiv.dataset.rawContent.includes(a.versions[0])
      );
      if (restoredArts.length) {
        restoredArts.forEach(art => {
          injectedArtifactIds.add(art.id);
          injectArtifactPill(contentDiv, art);
        });
      } else {
        // No restored artifacts — detect fresh ones
        const arts = detectArtifacts(contentDiv.dataset.rawContent);
        arts.forEach(art => {
          artifactStore.set(art.id, {
            id: art.id, type: art.type, language: art.language,
            title: art.title, versions: [art.content], currentVersion: 0,
            messageId: null
          });
          injectedArtifactIds.add(art.id);
          injectArtifactPill(contentDiv, art);
        });
      }
    }
  });

  // Inject pills for tool-call-based artifacts not matched to rawContent
  // (e.g. Write/Edit tool artifacts whose content isn't in markdown)
  const unmatchedArts = [...artifactStore.values()].filter(a => !injectedArtifactIds.has(a.id));
  if (unmatchedArts.length) {
    const lastAssistant = chatMessages.querySelector('.message.assistant:last-of-type .message-content');
    if (lastAssistant) {
      unmatchedArts.forEach(art => injectArtifactPill(lastAssistant, art));
    }
  }

  scrollToBottom();
}

// Render chat history sidebar (Root items only)
function renderChatHistory() {
  chatHistoryList.innerHTML = '';

  const rootChats = allChats.filter(c => !c.folder_id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (rootChats.length === 0 && chatFolders.length === 0) {
    chatHistoryList.innerHTML = '<div class="chat-history-empty">No chats yet</div>';
    return;
  }

  rootChats.forEach(chat => {
    const item = buildChatHistoryItem(chat);
    chatHistoryList.appendChild(item);
  });
}

// Switch to a different chat
function switchToChat(chatId) {
  // Abort any ongoing request when switching chats
  if (isWaitingForResponse) {
    window.electronAPI.abortCurrentRequest();
    isWaitingForResponse = false;
  }

  if (currentChatId) {
    saveState();
  }

  const chat = allChats.find(c => c.id === chatId);
  if (chat) {
    loadChat(chat);
  }

  // Update send button states
  updateSendButton(homeInput, homeSendBtn);
  updateSendButton(messageInput, chatSendBtn);
}

// Delete a chat
window.deleteChat = function(chatId, event) {
  event.stopPropagation();

  allChats = allChats.filter(c => c.id !== chatId);

  // Delete from API if authenticated, else localStorage
  if (useApi()) {
    fetch(apiBase() + '/api/chats/' + chatId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
    }).catch(err => console.error('[Delete] API error:', err));
  } else {
    localStorage.setItem('allChats', JSON.stringify(allChats));
  }

  if (currentChatId === chatId) {
    if (allChats.length > 0) {
      loadChat(allChats[0]);
    } else {
      currentChatId = null;
      localStorage.removeItem('currentChatId');
      showView('home');
      isFirstMessage = true;
    }
  }

  renderChatHistory();
}

// Update greeting based on time of day
function updateGreeting() {
  // Greeting is now static, no need to update
}

// --- Settings ---

async function loadSettings() {
  if (!window.electronAPI || typeof window.electronAPI.getSettings !== 'function') return;
  try {
    const data = await window.electronAPI.getSettings();
    cachedSettings = data;
    if (settingsAnthropicKey) settingsAnthropicKey.value = '';
    if (settingsComposioKey) settingsComposioKey.value = '';
    if (settingsSmitheryKey) settingsSmitheryKey.value = '';
    if (settingsPostizKey) settingsPostizKey.value = '';
    if (settingsDataforseoUsername) settingsDataforseoUsername.value = '';
    if (settingsDataforseoPassword) settingsDataforseoPassword.value = '';
    if (settingsAnthropicMasked) settingsAnthropicMasked.textContent = data.apiKeys?.anthropic ? 'Set (' + data.apiKeys.anthropic + ')' : 'Not set';
    if (settingsComposioMasked) settingsComposioMasked.textContent = data.apiKeys?.composio ? 'Set (' + data.apiKeys.composio + ')' : 'Not set';
    if (settingsSmitheryMasked) settingsSmitheryMasked.textContent = data.apiKeys?.smithery ? 'Set (' + data.apiKeys.smithery + ')' : 'Not set';
    if (settingsPostizMasked) settingsPostizMasked.textContent = data.apiKeys?.postiz ? 'Set (' + data.apiKeys.postiz + ')' : 'Not set';
    if (settingsDataforseoUsernameMasked) settingsDataforseoUsernameMasked.textContent = data.apiKeys?.dataforseoUsername ? 'Set (' + data.apiKeys.dataforseoUsername + ')' : 'Not set';
    if (settingsDataforseoPasswordMasked) settingsDataforseoPasswordMasked.textContent = data.apiKeys?.dataforseoPassword ? 'Set (' + data.apiKeys.dataforseoPassword + ')' : 'Not set';
    if (settingsKeysStatus) settingsKeysStatus.textContent = '';
    renderSettingsMcpList(data.mcpServers || []);
    hideSettingsMcpForm();
    renderBrowserSettings(data.browser);
    renderInstructions(data.instructions);
    renderPermissions(data.permissions);
    renderDocumentSettings(data.documents);
    loadPlugins();
  } catch (err) {
    if (settingsKeysStatus) {
      settingsKeysStatus.textContent = err.message && err.message.includes('404')
        ? 'Settings API not found (404). Restart the backend server (npm run start:server) and try again.'
        : 'Failed to load: ' + err.message;
      settingsKeysStatus.classList.add('error');
    }
  }
}

function showSettingsKeysStatus(msg, isError) {
  if (!settingsKeysStatus) return;
  settingsKeysStatus.textContent = msg;
  settingsKeysStatus.classList.toggle('error', isError);
}

async function saveSettingsKeys() {
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  const saveBtn = settingsSaveKeysBtn;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  const anthropic = settingsAnthropicKey ? settingsAnthropicKey.value.trim() : '';
  const composio = settingsComposioKey ? settingsComposioKey.value.trim() : '';
  const smithery = settingsSmitheryKey ? settingsSmitheryKey.value.trim() : '';
  const postiz = settingsPostizKey ? settingsPostizKey.value.trim() : '';
  const dataforseoUsername = settingsDataforseoUsername ? settingsDataforseoUsername.value.trim() : '';
  const dataforseoPassword = settingsDataforseoPassword ? settingsDataforseoPassword.value.trim() : '';
  const body = { apiKeys: { anthropic: anthropic || '', composio: composio || '', smithery: smithery || '', postiz: postiz || '', dataforseoUsername: dataforseoUsername || '', dataforseoPassword: dataforseoPassword || '' } };
  try {
    const data = await window.electronAPI.updateSettings(body);
    cachedSettings.apiKeys = data.apiKeys;
    if (settingsAnthropicKey) settingsAnthropicKey.value = '';
    if (settingsComposioKey) settingsComposioKey.value = '';
    if (settingsSmitheryKey) settingsSmitheryKey.value = '';
    if (settingsPostizKey) settingsPostizKey.value = '';
    if (settingsDataforseoUsername) settingsDataforseoUsername.value = '';
    if (settingsDataforseoPassword) settingsDataforseoPassword.value = '';
    if (settingsAnthropicMasked) settingsAnthropicMasked.textContent = data.apiKeys?.anthropic ? 'Set (' + data.apiKeys.anthropic + ')' : 'Not set';
    if (settingsComposioMasked) settingsComposioMasked.textContent = data.apiKeys?.composio ? 'Set (' + data.apiKeys.composio + ')' : 'Not set';
    if (settingsSmitheryMasked) settingsSmitheryMasked.textContent = data.apiKeys?.smithery ? 'Set (' + data.apiKeys.smithery + ')' : 'Not set';
    if (settingsPostizMasked) settingsPostizMasked.textContent = data.apiKeys?.postiz ? 'Set (' + data.apiKeys.postiz + ')' : 'Not set';
    if (settingsDataforseoUsernameMasked) settingsDataforseoUsernameMasked.textContent = data.apiKeys?.dataforseoUsername ? 'Set (' + data.apiKeys.dataforseoUsername + ')' : 'Not set';
    if (settingsDataforseoPasswordMasked) settingsDataforseoPasswordMasked.textContent = data.apiKeys?.dataforseoPassword ? 'Set (' + data.apiKeys.dataforseoPassword + ')' : 'Not set';
    showSettingsKeysStatus('Saved.');
  } catch (err) {
    showSettingsKeysStatus(err.message || 'Save failed', true);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save keys'; }
  }
}

function toggleSettingsKeyVisibility(inputEl, btnEl) {
  if (!inputEl || !btnEl) return;
  const isPassword = inputEl.type === 'password';
  inputEl.type = isPassword ? 'text' : 'password';
  btnEl.textContent = isPassword ? 'Hide' : 'Show';
}

function renderSettingsMcpList(list) {
  if (!settingsMcpList) return;
  settingsMcpList.innerHTML = '';
  (list || []).forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'settings-mcp-item';
    const typeLabel = entry.type === 'local' ? 'Local' : 'HTTP';
    const detail = entry.type === 'http' ? (entry.url || '') : (entry.command || '') + ' ' + (entry.args || []).join(' ');
    row.innerHTML = `
      <span class="settings-mcp-item-name">${escapeHtml(entry.name || 'Unnamed')}</span>
      <span class="settings-mcp-item-type">${typeLabel}</span>
      <span class="settings-mcp-item-detail">${escapeHtml(String(detail).slice(0, 40))}${String(detail).length > 40 ? '…' : ''}</span>
      <button type="button" class="settings-mcp-item-edit" data-id="${escapeHtml(entry.id)}" title="Edit">Edit</button>
      <button type="button" class="settings-mcp-item-remove" data-id="${escapeHtml(entry.id)}" title="Remove">Remove</button>
    `;
    row.querySelector('.settings-mcp-item-edit').addEventListener('click', () => openSettingsMcpForm(entry));
    row.querySelector('.settings-mcp-item-remove').addEventListener('click', () => removeSettingsMcp(entry.id));
    settingsMcpList.appendChild(row);
  });
}

function openSettingsMcpForm(entry) {
  settingsMcpEditingId = entry ? entry.id : null;
  if (settingsMcpFormTitle) settingsMcpFormTitle.textContent = entry ? 'Edit MCP server' : 'Add MCP server';
  if (settingsMcpName) settingsMcpName.value = entry ? (entry.name || '') : '';
  if (settingsMcpType) settingsMcpType.value = entry ? (entry.type || 'http') : 'http';
  if (settingsMcpUrl) settingsMcpUrl.value = entry && entry.type === 'http' ? (entry.url || '') : '';
  if (settingsMcpHeaders) settingsMcpHeaders.value = entry && entry.type === 'http' && entry.headers ? JSON.stringify(entry.headers, null, 2) : '{}';
  if (settingsMcpCommand) settingsMcpCommand.value = entry && entry.type === 'local' ? (entry.command || '') : '';
  if (settingsMcpArgs) settingsMcpArgs.value = entry && entry.type === 'local' && Array.isArray(entry.args) ? entry.args.join(', ') : '';
  settingsMcpForm.classList.remove('hidden');
  toggleSettingsMcpTypeFields(settingsMcpType ? settingsMcpType.value : 'http');
}

function hideSettingsMcpForm() {
  settingsMcpForm.classList.add('hidden');
  settingsMcpEditingId = null;
  if (settingsMcpStatus) settingsMcpStatus.textContent = '';
}

function toggleSettingsMcpTypeFields(type) {
  if (settingsMcpHttpFields) settingsMcpHttpFields.classList.toggle('hidden', type !== 'http');
  if (settingsMcpLocalFields) settingsMcpLocalFields.classList.toggle('hidden', type !== 'local');
}

async function saveSettingsMcp() {
  const name = settingsMcpName ? settingsMcpName.value.trim() : '';
  const type = settingsMcpType ? settingsMcpType.value : 'http';
  if (!name) {
    if (settingsMcpStatus) settingsMcpStatus.textContent = 'Name is required.';
    return;
  }
  let list = (cachedSettings.mcpServers || []).slice();
  const payload = { id: settingsMcpEditingId || 'mcp_' + Date.now(), name, type };
  if (type === 'http') {
    payload.url = settingsMcpUrl ? settingsMcpUrl.value.trim() : '';
    try {
      payload.headers = settingsMcpHeaders && settingsMcpHeaders.value.trim() ? JSON.parse(settingsMcpHeaders.value.trim()) : {};
    } catch (_) {
      if (settingsMcpStatus) settingsMcpStatus.textContent = 'Headers must be valid JSON.';
      return;
    }
  } else {
    payload.command = settingsMcpCommand ? settingsMcpCommand.value.trim() : '';
    payload.args = settingsMcpArgs ? settingsMcpArgs.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    payload.environment = {};
  }
  if (settingsMcpEditingId) {
    list = list.map((e) => (e.id === settingsMcpEditingId ? payload : e));
  } else {
    list.push(payload);
  }
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  try {
    const data = await window.electronAPI.updateSettings({ mcpServers: list });
    cachedSettings.mcpServers = data.mcpServers || [];
    renderSettingsMcpList(cachedSettings.mcpServers);
    hideSettingsMcpForm();
    if (settingsMcpStatus) settingsMcpStatus.textContent = 'Saved.';
  } catch (err) {
    if (settingsMcpStatus) settingsMcpStatus.textContent = err.message || 'Save failed';
  }
}

async function removeSettingsMcp(id) {
  const list = (cachedSettings.mcpServers || []).filter((e) => e.id !== id);
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  try {
    const data = await window.electronAPI.updateSettings({ mcpServers: list });
    cachedSettings.mcpServers = data.mcpServers || [];
    renderSettingsMcpList(cachedSettings.mcpServers);
    hideSettingsMcpForm();
  } catch (err) {
    if (settingsMcpStatus) settingsMcpStatus.textContent = err.message || 'Remove failed';
  }
}

// --- Browser Settings ---

function renderBrowserSettings(browserData) {
  const b = browserData || { enabled: false, mode: 'clawd', headless: false, backend: 'builtin', cdpPort: 9222 };
  if (settingsBrowserEnabled) settingsBrowserEnabled.checked = b.enabled;
  if (settingsBrowserBackend) settingsBrowserBackend.value = b.backend || 'builtin';
  if (settingsBrowserMode) settingsBrowserMode.value = b.mode || 'clawd';
  if (settingsBrowserHeadless) settingsBrowserHeadless.checked = b.headless || false;
  if (settingsBrowserCdpPort) settingsBrowserCdpPort.value = b.cdpPort || 9222;
  if (settingsBrowserStatus) settingsBrowserStatus.textContent = '';
  toggleBrowserOptionsVisibility();
}

function toggleBrowserOptionsVisibility() {
  const enabled = settingsBrowserEnabled && settingsBrowserEnabled.checked;
  if (settingsBrowserOptions) settingsBrowserOptions.classList.toggle('hidden', !enabled);

  const backend = settingsBrowserBackend ? settingsBrowserBackend.value : 'builtin';
  if (settingsAgentBrowserHint) settingsAgentBrowserHint.classList.toggle('hidden', backend !== 'agent-browser');
  if (settingsBrowserBuiltinOptions) settingsBrowserBuiltinOptions.classList.toggle('hidden', backend !== 'builtin');

  const mode = settingsBrowserMode ? settingsBrowserMode.value : 'clawd';
  if (settingsCdpPortField) settingsCdpPortField.classList.toggle('hidden', mode !== 'chrome');
}

async function saveBrowserSettings() {
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  const body = {
    browser: {
      enabled: settingsBrowserEnabled ? settingsBrowserEnabled.checked : false,
      backend: settingsBrowserBackend ? settingsBrowserBackend.value : 'builtin',
      mode: settingsBrowserMode ? settingsBrowserMode.value : 'clawd',
      headless: settingsBrowserHeadless ? settingsBrowserHeadless.checked : false,
      cdpPort: settingsBrowserCdpPort ? parseInt(settingsBrowserCdpPort.value) || 9222 : 9222
    }
  };
  try {
    const data = await window.electronAPI.updateSettings(body);
    cachedSettings.browser = data.browser;
    if (settingsBrowserStatus) settingsBrowserStatus.textContent = 'Saved.';
  } catch (err) {
    if (settingsBrowserStatus) {
      settingsBrowserStatus.textContent = err.message || 'Save failed';
      settingsBrowserStatus.classList.add('error');
    }
  }
}

// ==================== Instructions Settings ====================

let folderInstructionsData = []; // local copy for CRUD
let editingFolderIndex = -1;     // -1 = adding new, >=0 = editing existing

// Permission state
let allowedDirectoriesData = [];
let pendingPermissionRequest = null; // { chatId, requestId }

function renderInstructions(instructions) {
  const inst = instructions || { global: '', folders: [] };
  if (settingsGlobalInstructions) settingsGlobalInstructions.value = inst.global || '';
  folderInstructionsData = Array.isArray(inst.folders) ? inst.folders.map(f => ({ ...f })) : [];
  renderFolderInstructionsList();
  if (settingsInstructionsStatus) settingsInstructionsStatus.textContent = '';
}

function renderFolderInstructionsList() {
  if (!settingsFolderInstructionsList) return;
  if (folderInstructionsData.length === 0) {
    settingsFolderInstructionsList.textContent = '';
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--text-muted);font-size:13px;';
    p.textContent = 'No folder instructions configured.';
    settingsFolderInstructionsList.appendChild(p);
    return;
  }
  settingsFolderInstructionsList.textContent = '';
  folderInstructionsData.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.style.marginBottom = '8px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    const info = document.createElement('div');
    const pathEl = document.createElement('strong');
    pathEl.style.fontSize = '13px';
    pathEl.textContent = f.path;
    const desc = document.createElement('p');
    desc.style.cssText = 'margin:2px 0 0;font-size:12px;color:var(--text-muted);';
    const preview = (f.instructions || '').substring(0, 80);
    desc.textContent = preview + ((f.instructions || '').length > 80 ? '...' : '');
    info.appendChild(pathEl);
    info.appendChild(desc);

    const btns = document.createElement('div');
    const editBtn = document.createElement('button');
    editBtn.className = 'settings-btn';
    editBtn.style.cssText = 'margin-right:4px;padding:2px 8px;font-size:12px;';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openFolderInstructionForm(i));
    const delBtn = document.createElement('button');
    delBtn.className = 'settings-btn';
    delBtn.style.cssText = 'padding:2px 8px;font-size:12px;color:var(--error);';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      folderInstructionsData.splice(i, 1);
      renderFolderInstructionsList();
    });
    btns.appendChild(editBtn);
    btns.appendChild(delBtn);

    row.appendChild(info);
    row.appendChild(btns);
    item.appendChild(row);
    settingsFolderInstructionsList.appendChild(item);
  });
}

function openFolderInstructionForm(index) {
  if (!settingsFolderInstructionForm) return;
  editingFolderIndex = index === null || index === undefined ? -1 : index;
  if (editingFolderIndex >= 0 && folderInstructionsData[editingFolderIndex]) {
    settingsFolderPath.value = folderInstructionsData[editingFolderIndex].path || '';
    settingsFolderInstructionsText.value = folderInstructionsData[editingFolderIndex].instructions || '';
  } else {
    settingsFolderPath.value = '';
    settingsFolderInstructionsText.value = '';
  }
  settingsFolderInstructionForm.style.display = 'block';
}

function cancelFolderInstruction() {
  if (settingsFolderInstructionForm) settingsFolderInstructionForm.style.display = 'none';
  editingFolderIndex = -1;
}

function saveFolderInstruction() {
  const path = (settingsFolderPath ? settingsFolderPath.value : '').trim();
  const instructions = (settingsFolderInstructionsText ? settingsFolderInstructionsText.value : '').trim();
  if (!path) return;
  const entry = { path, instructions };
  if (editingFolderIndex >= 0) {
    folderInstructionsData[editingFolderIndex] = entry;
  } else {
    folderInstructionsData.push(entry);
  }
  renderFolderInstructionsList();
  cancelFolderInstruction();
}

async function saveInstructions() {
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  const body = {
    instructions: {
      global: settingsGlobalInstructions ? settingsGlobalInstructions.value : '',
      folders: folderInstructionsData
    }
  };
  try {
    const data = await window.electronAPI.updateSettings(body);
    cachedSettings.instructions = data.instructions;
    if (settingsInstructionsStatus) {
      settingsInstructionsStatus.textContent = 'Saved.';
      settingsInstructionsStatus.classList.remove('error');
    }
  } catch (err) {
    if (settingsInstructionsStatus) {
      settingsInstructionsStatus.textContent = err.message || 'Save failed';
      settingsInstructionsStatus.classList.add('error');
    }
  }
}

// ---- Permission Settings ----
function renderPermissions(permissions) {
  const perms = permissions || { mode: 'bypassPermissions', allowedDirectories: [], fileDeleteConfirmation: true };
  if (settingsPermissionMode) settingsPermissionMode.value = perms.mode || 'bypassPermissions';
  if (settingsFileDeleteConfirmation) settingsFileDeleteConfirmation.checked = perms.fileDeleteConfirmation !== false;
  allowedDirectoriesData = Array.isArray(perms.allowedDirectories) ? perms.allowedDirectories.slice() : [];
  renderAllowedDirectoriesList();
  if (settingsPermissionsStatus) settingsPermissionsStatus.textContent = '';
}
function renderAllowedDirectoriesList() {
  if (!settingsAllowedDirectoriesList) return;
  settingsAllowedDirectoriesList.textContent = '';
  if (allowedDirectoriesData.length === 0) {
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--text-muted);font-size:13px;';
    p.textContent = 'No allowed directories configured.';
    settingsAllowedDirectoriesList.appendChild(p);
    return;
  }
  allowedDirectoriesData.forEach((dir, i) => {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    const pathEl = document.createElement('span');
    pathEl.style.cssText = 'font-size:13px;font-family:var(--font-mono);word-break:break-all;';
    pathEl.textContent = dir;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'settings-btn';
    removeBtn.style.cssText = 'padding:2px 8px;font-size:12px;color:var(--error);flex-shrink:0;margin-left:8px;';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => { allowedDirectoriesData.splice(i, 1); renderAllowedDirectoriesList(); });
    item.appendChild(pathEl);
    item.appendChild(removeBtn);
    settingsAllowedDirectoriesList.appendChild(item);
  });
}
function addAllowedDirectory() {
  if (!settingsNewDirectoryPath) return;
  const dir = settingsNewDirectoryPath.value.trim();
  if (!dir) return;
  if (allowedDirectoriesData.includes(dir)) { settingsNewDirectoryPath.value = ''; return; }
  allowedDirectoriesData.push(dir);
  settingsNewDirectoryPath.value = '';
  renderAllowedDirectoriesList();
}
async function savePermissions() {
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  const body = { permissions: { mode: settingsPermissionMode ? settingsPermissionMode.value : 'bypassPermissions', allowedDirectories: allowedDirectoriesData, fileDeleteConfirmation: settingsFileDeleteConfirmation ? settingsFileDeleteConfirmation.checked : true } };
  try {
    const data = await window.electronAPI.updateSettings(body);
    cachedSettings.permissions = data.permissions;
    if (settingsPermissionsStatus) { settingsPermissionsStatus.textContent = 'Saved.'; settingsPermissionsStatus.classList.remove('error'); }
  } catch (err) {
    if (settingsPermissionsStatus) { settingsPermissionsStatus.textContent = err.message || 'Save failed'; settingsPermissionsStatus.classList.add('error'); }
  }
}
// ---- Document Generation Settings ----
function renderDocumentSettings(documents) {
  const docs = documents || {};
  if (settingsDocOutputDir) settingsDocOutputDir.value = docs.outputDirectory || '';
  if (settingsDocumentsStatus) settingsDocumentsStatus.textContent = '';
}
async function saveDocumentSettings() {
  if (!window.electronAPI || typeof window.electronAPI.updateSettings !== 'function') return;
  const body = { documents: { outputDirectory: settingsDocOutputDir ? settingsDocOutputDir.value.trim() : '' } };
  try {
    const data = await window.electronAPI.updateSettings(body);
    cachedSettings.documents = data.documents;
    if (settingsDocumentsStatus) { settingsDocumentsStatus.textContent = 'Saved.'; settingsDocumentsStatus.classList.remove('error'); }
  } catch (err) {
    if (settingsDocumentsStatus) { settingsDocumentsStatus.textContent = err.message || 'Save failed'; settingsDocumentsStatus.classList.add('error'); }
  }
}

// ---- Plugin Settings ----
async function loadPlugins() {
  if (!window.electronAPI || typeof window.electronAPI.getPlugins !== 'function') return;
  try {
    const plugins = await window.electronAPI.getPlugins();
    renderPluginsList(plugins);
  } catch (err) {
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = 'Failed to load plugins'; settingsPluginsStatus.classList.add('error'); }
  }
}

function renderPluginsList(plugins) {
  if (!settingsPluginsList) return;
  if (!plugins || plugins.length === 0) {
    settingsPluginsList.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;">No plugins installed. Install one from a Git URL above.</p>';
    return;
  }
  settingsPluginsList.textContent = '';
  const fragment = document.createDocumentFragment();

  plugins.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'plugin-card';
    card.dataset.pluginDir = p.dirName || '';

    const header = document.createElement('div');
    header.className = 'plugin-card-header';

    const info = document.createElement('div');
    info.className = 'plugin-card-info';

    const name = document.createElement('span');
    name.className = 'plugin-card-name';
    name.textContent = p.name || '';

    const version = document.createElement('span');
    version.className = 'plugin-card-version';
    version.textContent = `v${p.version || '0.0.0'}`;

    info.append(name, version);

    const actions = document.createElement('div');
    actions.className = 'plugin-card-actions';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'plugin-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!p.enabled;
    const toggleStatus = document.createElement('span');
    toggleStatus.className = 'plugin-toggle-label';
    toggleStatus.textContent = p.enabled ? 'Enabled' : 'Disabled';
    toggle.addEventListener('change', () => {
      togglePlugin(p.name, toggle.checked);
      toggleStatus.textContent = toggle.checked ? 'Enabled' : 'Disabled';
    });

    toggleLabel.append(toggle, toggleStatus);
    actions.appendChild(toggleLabel);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'plugin-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove plugin';
    removeBtn.setAttribute('aria-label', `Remove plugin ${p.name || 'unnamed'}`);
    removeBtn.addEventListener('click', () => {
      removePlugin(p.dirName, p.name);
    });
    actions.appendChild(removeBtn);

    header.append(info, actions);
    card.appendChild(header);

    if (p.description) {
      const desc = document.createElement('p');
      desc.className = 'plugin-card-desc';
      desc.textContent = p.description;
      card.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'plugin-card-meta';

    if (p.author) {
      const author = document.createElement('span');
      author.textContent = `by ${p.author}`;
      meta.appendChild(author);
    }
    if (p.category) {
      const category = document.createElement('span');
      category.className = 'plugin-card-category';
      category.textContent = p.category;
      meta.appendChild(category);
    }
    if (p.hasMcp) {
      const badge = document.createElement('span');
      badge.className = 'plugin-badge';
      badge.textContent = 'MCP';
      meta.appendChild(badge);
    }
    if (p.hasSkills) {
      const badge = document.createElement('span');
      badge.className = 'plugin-badge';
      badge.textContent = 'Skills';
      meta.appendChild(badge);
    }
    if (p.agents && p.agents.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'plugin-badge';
      badge.textContent = 'Agents';
      meta.appendChild(badge);
    }
    card.appendChild(meta);
    fragment.appendChild(card);
  });

  settingsPluginsList.appendChild(fragment);
}

async function installPlugin() {
  if (!settingsPluginUrl || !settingsPluginUrl.value.trim()) return;
  const gitUrl = settingsPluginUrl.value.trim();
  if (settingsPluginsStatus) { settingsPluginsStatus.textContent = 'Installing...'; settingsPluginsStatus.classList.remove('error'); }
  try {
    await window.electronAPI.installPlugin(gitUrl);
    settingsPluginUrl.value = '';
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = 'Plugin installed successfully.'; settingsPluginsStatus.classList.remove('error'); }
    await loadPlugins();
  } catch (err) {
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = err.message || 'Install failed'; settingsPluginsStatus.classList.add('error'); }
  }
}

async function togglePlugin(name, enabled) {
  try {
    if (enabled) {
      await window.electronAPI.enablePlugin(name);
    } else {
      await window.electronAPI.disablePlugin(name);
    }
    await loadPlugins();
  } catch (err) {
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = err.message || 'Toggle failed'; settingsPluginsStatus.classList.add('error'); }
  }
}

async function removePlugin(dirName, name) {
  if (!confirm(`Remove plugin "${name}"? This will delete its files.`)) return;
  try {
    await window.electronAPI.removePlugin(dirName);
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = 'Plugin removed.'; settingsPluginsStatus.classList.remove('error'); }
    await loadPlugins();
  } catch (err) {
    if (settingsPluginsStatus) { settingsPluginsStatus.textContent = err.message || 'Remove failed'; settingsPluginsStatus.classList.add('error'); }
  }
}

function showPermissionDialog(chatId, requestId, toolName, toolInput) {
  pendingPermissionRequest = { chatId, requestId };
  if (permissionToolName) permissionToolName.textContent = toolName || 'Unknown tool';
  if (permissionToolInput) { try { permissionToolInput.textContent = JSON.stringify(toolInput, null, 2); } catch (e) { permissionToolInput.textContent = String(toolInput); } }
  if (permissionDialogOverlay) permissionDialogOverlay.style.display = 'flex';
}
function hidePermissionDialog() {
  if (permissionDialogOverlay) permissionDialogOverlay.style.display = 'none';
  pendingPermissionRequest = null;
}
async function handlePermissionResponse(behavior) {
  if (!pendingPermissionRequest) return;
  const { chatId, requestId } = pendingPermissionRequest;
  hidePermissionDialog();
  if (window.electronAPI && typeof window.electronAPI.respondToPermission === 'function') { await window.electronAPI.respondToPermission(chatId, requestId, behavior); }
}

// Setup all event listeners
function setupEventListeners() {
  // Home form
  homeForm.addEventListener('submit', handleSendMessage);
  homeInput.addEventListener('input', () => {
    updateSendButton(homeInput, homeSendBtn);
    autoResizeTextarea(homeInput);
  });
  homeInput.addEventListener('keydown', (e) => handleKeyPress(e, homeForm));

  // Chat form
  chatForm.addEventListener('submit', handleSendMessage);
  messageInput.addEventListener('input', () => {
    updateSendButton(messageInput, chatSendBtn);
    autoResizeTextarea(messageInput);
  });
  messageInput.addEventListener('keydown', (e) => handleKeyPress(e, chatForm));

  // Right sidebar toggle
  sidebarToggle.addEventListener('click', toggleSidebar);
  rightSidebarExpand.addEventListener('click', toggleSidebar);

  // Left sidebar toggle (chat history)
  if (leftSidebarToggle) leftSidebarToggle.addEventListener('click', toggleLeftSidebar);
  if (leftSidebarExpand) leftSidebarExpand.addEventListener('click', toggleLeftSidebar);

  // Database Explorer
  const navDbBtn = document.getElementById('navDbBtn');
  const dbBackBtn = document.getElementById('dbBackBtn');
  if (navDbBtn) navDbBtn.addEventListener('click', () => showView('database'));
  if (dbBackBtn) dbBackBtn.addEventListener('click', () => showView(lastViewBeforeSettings));

  // Settings
  if (settingsBackBtn) settingsBackBtn.addEventListener('click', closeSettings);

  // Section back buttons
  const reportsBackBtn = document.getElementById('reportsBackBtn');
  const jobsBackBtn = document.getElementById('jobsBackBtn');
  if (vaultBackBtn) vaultBackBtn.addEventListener('click', () => showView(lastViewBeforeSettings));
  if (reportsBackBtn) reportsBackBtn.addEventListener('click', () => showView(lastViewBeforeSettings));
  if (jobsBackBtn) jobsBackBtn.addEventListener('click', () => showView(lastViewBeforeSettings));
  if (settingsSaveKeysBtn) settingsSaveKeysBtn.addEventListener('click', saveSettingsKeys);
  if (settingsAnthropicToggle) settingsAnthropicToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsAnthropicKey, settingsAnthropicToggle));
  if (settingsComposioToggle) settingsComposioToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsComposioKey, settingsComposioToggle));
  if (settingsSmitheryToggle) settingsSmitheryToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsSmitheryKey, settingsSmitheryToggle));
  if (settingsPostizToggle) settingsPostizToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsPostizKey, settingsPostizToggle));
  if (settingsDataforseoUsernameToggle) settingsDataforseoUsernameToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsDataforseoUsername, settingsDataforseoUsernameToggle));
  if (settingsDataforseoPasswordToggle) settingsDataforseoPasswordToggle.addEventListener('click', () => toggleSettingsKeyVisibility(settingsDataforseoPassword, settingsDataforseoPasswordToggle));
  if (settingsAddMcpBtn) settingsAddMcpBtn.addEventListener('click', () => openSettingsMcpForm(null));
  if (settingsMcpType) settingsMcpType.addEventListener('change', () => toggleSettingsMcpTypeFields(settingsMcpType.value));
  if (settingsMcpCancelBtn) settingsMcpCancelBtn.addEventListener('click', hideSettingsMcpForm);
  if (settingsMcpSaveBtn) settingsMcpSaveBtn.addEventListener('click', saveSettingsMcp);

  // Browser settings
  if (settingsBrowserEnabled) settingsBrowserEnabled.addEventListener('change', toggleBrowserOptionsVisibility);
  if (settingsBrowserBackend) settingsBrowserBackend.addEventListener('change', toggleBrowserOptionsVisibility);
  if (settingsBrowserMode) settingsBrowserMode.addEventListener('change', toggleBrowserOptionsVisibility);
  if (settingsSaveBrowserBtn) settingsSaveBrowserBtn.addEventListener('click', saveBrowserSettings);

  // Instructions settings
  if (settingsAddFolderInstructionBtn) settingsAddFolderInstructionBtn.addEventListener('click', () => openFolderInstructionForm(null));
  if (settingsFolderCancelBtn) settingsFolderCancelBtn.addEventListener('click', cancelFolderInstruction);
  if (settingsFolderSaveBtn) settingsFolderSaveBtn.addEventListener('click', saveFolderInstruction);
  if (settingsSaveInstructionsBtn) settingsSaveInstructionsBtn.addEventListener('click', saveInstructions);

  // Permission settings
  if (settingsAddDirectoryBtn) settingsAddDirectoryBtn.addEventListener('click', addAllowedDirectory);
  if (settingsSavePermissionsBtn) settingsSavePermissionsBtn.addEventListener('click', savePermissions);
  if (permissionAllowBtn) permissionAllowBtn.addEventListener('click', () => handlePermissionResponse('allow'));
  if (permissionDenyBtn) permissionDenyBtn.addEventListener('click', () => handlePermissionResponse('deny'));

  // Document generation settings
  if (settingsSaveDocumentsBtn) settingsSaveDocumentsBtn.addEventListener('click', saveDocumentSettings);

  // Plugin settings
  if (settingsInstallPluginBtn) settingsInstallPluginBtn.addEventListener('click', installPlugin);

  // File attachment inputs
  const homeFileInput = document.getElementById('homeFileInput');
  const chatFileInput = document.getElementById('chatFileInput');
  homeFileInput.addEventListener('change', (e) => handleFileSelect(e, 'home'));
  chatFileInput.addEventListener('change', (e) => handleFileSelect(e, 'chat'));

  // Unified attach popovers
  function setupAttachPopover(context) {
    const containerId = context === 'home' ? 'homeAttachContainer' : 'chatAttachContainer';
    const toggleBtnId = context === 'home' ? 'homeAttachBtn' : 'chatAttachBtn';
    const popoverId = context === 'home' ? 'homeAttachPopover' : 'chatAttachPopover';
    const fileBtn = document.getElementById(context === 'home' ? 'homeAttachFileBtn' : 'chatAttachFileBtn');
    const fileInput = context === 'home' ? homeFileInput : chatFileInput;
    const vaultBtn = document.getElementById(context === 'home' ? 'homeVaultPickerBtn' : 'chatVaultPickerBtn');

    const toggleBtn = document.getElementById(toggleBtnId);
    const popover = document.getElementById(popoverId);
    if (!toggleBtn || !popover) return;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    });
    if (fileBtn) fileBtn.addEventListener('click', () => { popover.classList.add('hidden'); fileInput.click(); });
    if (vaultBtn) vaultBtn.addEventListener('click', () => { popover.classList.add('hidden'); openVaultPicker(context); });

    document.addEventListener('click', (e) => {
      const container = document.getElementById(containerId);
      if (container && !container.contains(e.target)) popover.classList.add('hidden');
    }, true);
  }
  setupAttachPopover('home');
  setupAttachPopover('chat');

  // Vault picker buttons (also wired via popover above; these are kept for direct access)
  const homeVaultPickerBtn = document.getElementById('homeVaultPickerBtn');
  const chatVaultPickerBtn = document.getElementById('chatVaultPickerBtn');

  const newFolderBtn = document.getElementById('newFolderBtn');
  if (newFolderBtn) newFolderBtn.addEventListener('click', () => createFolder(currentFolderType));

  // Navigation Rail Listeners
  document.querySelectorAll('.nav-rail-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (view === 'chat' && currentMainView === 'chat') {
        // Toggle sidebar if already in chat view
        toggleLeftSidebar();
      } else {
        showView(view);
        // Ensure sidebar is visible when switching to chat
        if (view === 'chat' && leftSidebar && leftSidebar.classList.contains('collapsed')) {
          toggleLeftSidebar();
        }
      }
    });
  });

  const navSignOutBtn = document.getElementById('navSignOutBtn');
  if (navSignOutBtn) {
    navSignOutBtn.addEventListener('click', handleSignOut);
  }

  // Settings page sign-out button
  const settingsSignOutBtn = document.getElementById('settingsSignOutBtn');
  if (settingsSignOutBtn) settingsSignOutBtn.addEventListener('click', handleSignOut);

  // Setup dropdowns
  setupDropdowns();

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
      document.querySelectorAll('.dropdown-container.open').forEach(d => d.classList.remove('open'));
    }
  });
}

// Setup dropdown functionality
function setupDropdowns() {
  // Thinking mode toggle buttons
  ['homeThinkingBtn', 'chatThinkingBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      thinkingMode = thinkingMode === 'normal' ? 'extended' : 'normal';

      // Update all thinking buttons
      document.querySelectorAll('.thinking-btn').forEach(b => {
        b.classList.toggle('active', thinkingMode === 'extended');
      });
    });
  });

  ['homeProviderDropdown', 'chatProviderDropdown'].forEach(id => {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;

    const btn = dropdown.querySelector('.provider-selector');
    const items = dropdown.querySelectorAll('.dropdown-item');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOtherDropdowns(dropdown);
      dropdown.classList.toggle('open');
    });

    items.forEach(item => {
      item.addEventListener('click', () => {
        const value = item.dataset.value;
        if (!value) return;

        const label = item.querySelector('.item-label').textContent;
        selectedProvider = value;

        // Update all provider selectors
        document.querySelectorAll('.provider-selector .provider-label').forEach(l => {
          l.textContent = label;
        });

        // Update selected state and checkmarks for provider dropdowns
        document.querySelectorAll('.provider-menu .dropdown-item').forEach(i => {
          const isSelected = i.dataset.value === value;
          i.classList.toggle('selected', isSelected);

          // Update checkmark visibility
          let checkIcon = i.querySelector('.check-icon');
          if (isSelected && !checkIcon) {
            // Add checkmark if selected and doesn't have one
            const itemRow = i.querySelector('.item-row');
            if (itemRow) {
              checkIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              checkIcon.setAttribute('class', 'check-icon');
              checkIcon.setAttribute('viewBox', '0 0 24 24');
              checkIcon.setAttribute('fill', 'none');
              checkIcon.setAttribute('stroke', 'currentColor');
              checkIcon.setAttribute('stroke-width', '2');
              checkIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
              itemRow.appendChild(checkIcon);
            }
          }
          if (checkIcon) {
            checkIcon.style.display = isSelected ? 'block' : 'none';
          }
        });

        // Update model dropdown for new provider
        updateModelDropdowns(value);

        // Save to localStorage immediately
        localStorage.setItem('selectedProvider', value);
        localStorage.setItem('selectedModel', selectedModel);

        dropdown.classList.remove('open');
      });
    });
  });

  // Model selector dropdowns
  ['homeModelDropdown', 'chatModelDropdown'].forEach(id => {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;

    const btn = dropdown.querySelector('.model-selector');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOtherDropdowns(dropdown);
      dropdown.classList.toggle('open');
    });

    // Event delegation for model items (since they're dynamically updated)
    dropdown.querySelector('.model-menu').addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;

      const value = item.dataset.value;
      if (!value) return;

      const label = item.querySelector('.item-label').textContent;
      selectedModel = value;

      // Update all model selectors
      document.querySelectorAll('.model-selector .model-label').forEach(l => {
        l.textContent = label;
      });

      // Update selected state and checkmarks
      document.querySelectorAll('.model-menu .dropdown-item').forEach(i => {
        const isSelected = i.dataset.value === value;
        i.classList.toggle('selected', isSelected);

        // Update checkmark visibility
        const checkIcon = i.querySelector('.check-icon');
        if (checkIcon) {
          checkIcon.style.display = isSelected ? 'block' : 'none';
        }
      });

      // Save to localStorage immediately
      localStorage.setItem('selectedModel', value);

      dropdown.classList.remove('open');
    });
  });
}

// Update model dropdowns based on selected provider
function updateModelDropdowns(provider) {
  const models = providerModels[provider] || providerModels.claude;

  // Find default model for this provider
  const defaultModel = models.find(m => m.default) || models[0];
  selectedModel = defaultModel.value;

  // Save to localStorage
  localStorage.setItem('selectedModel', selectedModel);

  // Generate HTML for model items
  const modelItemsHtml = models.map(model => `
    <div class="dropdown-item${model.default ? ' selected' : ''}" data-value="${model.value}">
      <div class="item-row">
        <span class="item-label">${model.label}</span>
        ${model.default ? `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>` : ''}
      </div>
      <span class="item-desc">${model.desc}</span>
    </div>
  `).join('');

  // Update both model menus
  document.querySelectorAll('.model-menu').forEach(menu => {
    menu.innerHTML = modelItemsHtml;
    menu.dataset.provider = provider;
  });

  // Update model label in selectors
  document.querySelectorAll('.model-selector .model-label').forEach(l => {
    l.textContent = defaultModel.label;
  });
}

// Close other dropdowns
function closeOtherDropdowns(currentDropdown) {
  document.querySelectorAll('.dropdown-container.open').forEach(d => {
    if (d !== currentDropdown) d.classList.remove('open');
  });
}

// Handle file selection
function handleFileSelect(event, context) {
  const files = Array.from(event.target.files);
  files.forEach(file => {
    if (attachedFiles.length >= 5) {
      showAppError('Maximum 5 files allowed');
      return;
    }

    // Upload to Supabase Storage if authenticated, else read locally
    if (useApi()) {
      const formData = new FormData();
      formData.append('file', file);
      if (currentChatId) formData.append('chatId', currentChatId);

      fetch(apiBase() + '/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(), // No Content-Type — browser sets multipart boundary
        body: formData
      })
        .then(r => r.json())
        .then(attachment => {
          attachedFiles.push({
            id: attachment.id,
            name: attachment.file_name,
            type: attachment.file_type,
            size: attachment.file_size,
            storagePath: attachment.storage_path
          });
          renderAttachedFiles(context);
        })
        .catch(err => {
          console.error('[Upload] Error:', err);
          // Fall back to local read
          readFileLocally(file, context);
        });
    } else {
      readFileLocally(file, context);
    }
  });

  event.target.value = '';
}

function readFileLocally(file, context) {
  const reader = new FileReader();
  reader.onload = (e) => {
    attachedFiles.push({
      name: file.name,
      type: file.type,
      size: file.size,
      data: e.target.result
    });
    renderAttachedFiles(context);
  };

  if (file.type.startsWith('image/')) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}

// Render attached files preview
function renderAttachedFiles(context) {
  const inputWrapper = context === 'home'
    ? document.querySelector('#homeForm .input-wrapper')
    : document.querySelector('#chatForm .input-wrapper');

  let filesContainer = inputWrapper.querySelector('.attached-files');
  if (!filesContainer) {
    filesContainer = document.createElement('div');
    filesContainer.className = 'attached-files';
    inputWrapper.insertBefore(filesContainer, inputWrapper.firstChild);
  }

  filesContainer.textContent = '';

  attachedFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'attached-file';

    const fileIcon = document.createElement('svg');
    fileIcon.setAttribute('viewBox', '0 0 24 24');
    fileIcon.setAttribute('fill', 'none');
    fileIcon.setAttribute('stroke', 'currentColor');
    fileIcon.setAttribute('stroke-width', '2');
    fileIcon.innerHTML = `
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    `;

    const name = document.createElement('span');
    name.textContent = file.name || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-file';
    removeBtn.setAttribute('aria-label', 'Remove attached file');
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    removeBtn.addEventListener('click', () => {
      attachedFiles.splice(index, 1);
      renderAttachedFiles(context);
    });

    row.append(fileIcon, name, removeBtn);
    filesContainer.appendChild(row);
  });

  if (attachedFiles.length === 0) {
    filesContainer.remove();
  }
}

// ==================== VAULT PICKER ====================

// Open compact dropdown for picking vault assets to attach to chat
async function openVaultPicker(context) {
  // Close any existing picker first
  const existing = document.querySelector('.vault-picker-dropdown');
  if (existing) { existing.remove(); return; }

  const api = window.electronAPI || window.webAPI;
  if (!api?.getVaultAssets) return;

  // Position near the button
  const btnId = context === 'home' ? 'homeVaultPickerBtn' : 'chatVaultPickerBtn';
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const rect = btn.getBoundingClientRect();

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'vault-picker-dropdown';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

  dropdown.innerHTML = `
    <div class="vault-picker-header">
      <input type="text" class="vault-picker-search" placeholder="Search vault assets..." />
    </div>
    <div class="vault-picker-list">
      <div class="vault-picker-loading">Loading...</div>
    </div>
  `;

  document.body.appendChild(dropdown);

  const searchInput = dropdown.querySelector('.vault-picker-search');
  const listEl = dropdown.querySelector('.vault-picker-list');

  // Load assets
  let allAssets = [];
  try {
    const result = await api.getVaultAssets({ sort: 'created_at', dir: 'desc', limit: 50 });
    allAssets = Array.isArray(result) ? result : (result.assets || []);
  } catch (err) {
    console.error('[VAULT PICKER] Load error:', err);
    listEl.innerHTML = '<div class="vault-picker-empty">Failed to load assets</div>';
    return;
  }

  function renderList(filter = '') {
    const filtered = filter
      ? allAssets.filter(a => (a.display_name || a.file_name || '').toLowerCase().includes(filter.toLowerCase()))
      : allAssets;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="vault-picker-empty">${filter ? 'No matching assets' : 'No assets in vault'}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(asset => {
      const name = asset.display_name || asset.file_name || 'Untitled';
      const size = asset.file_size ? formatVaultPickerSize(asset.file_size) : '';
      const isImage = (asset.file_type || '').startsWith('image/');
      const icon = isImage
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      const sourceTag = asset.source && asset.source !== 'upload'
        ? `<span class="vault-picker-source">${asset.source === 'ai_generated' ? 'AI' : asset.source}</span>`
        : '';
      return `<div class="vault-picker-item" data-id="${asset.id}">
        <div class="vault-picker-icon">${icon}</div>
        <div class="vault-picker-info">
          <div class="vault-picker-name">${escHtml(name)}</div>
          <div class="vault-picker-meta">${size}${sourceTag}</div>
        </div>
      </div>`;
    }).join('');

    // Click handlers
    listEl.querySelectorAll('.vault-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const asset = filtered.find(a => a.id === id);
        if (!asset) return;
        // Check if already attached
        if (attachedFiles.some(f => f.id === asset.id)) {
          dropdown.remove();
          return;
        }
        attachedFiles.push({
          id: asset.id,
          name: asset.display_name || asset.file_name,
          type: asset.file_type,
          size: asset.file_size,
          storagePath: asset.storage_path
        });
        renderAttachedFiles(context);
        dropdown.remove();
      });
    });
  }

  renderList();

  // Search filter
  searchInput.addEventListener('input', () => renderList(searchInput.value.trim()));
  searchInput.focus();

  // Close on click outside
  function onClickOutside(e) {
    if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', onClickOutside);
    }
  }
  // Delay to avoid the opening click triggering close
  setTimeout(() => document.addEventListener('click', onClickOutside), 0);
}

function formatVaultPickerSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Toggle sidebar (right sidebar)
function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
  const isCollapsed = sidebar.classList.contains('collapsed');

  rightSidebarExpand.classList.toggle('visible', isCollapsed);

  const icon = sidebarToggle.querySelector('svg');
  if (isCollapsed) {
    icon.innerHTML = '<polyline points="15 18 9 12 15 6"></polyline>';
    sidebarToggle.title = 'Expand sidebar';
  } else {
    icon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
    sidebarToggle.title = 'Collapse sidebar';
  }
}

// Toggle left sidebar (chat history)
function toggleLeftSidebar() {
  if (!leftSidebar) return;
  leftSidebar.classList.toggle('collapsed');
  const isCollapsed = leftSidebar.classList.contains('collapsed');

  if (leftSidebarExpand) leftSidebarExpand.classList.toggle('visible', isCollapsed);

  // Update toggle button icon direction
  const icon = leftSidebarToggle ? leftSidebarToggle.querySelector('svg') : null;
  if (icon) {
    if (isCollapsed) {
      icon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
      leftSidebarToggle.title = 'Expand sidebar';
    } else {
      icon.innerHTML = '<polyline points="15 18 9 12 15 6"></polyline>';
      leftSidebarToggle.title = 'Collapse sidebar';
    }
  }
}

// Update send button state
function updateSendButton(input, button) {
  if (!button || !input) return;
  if (isWaitingForResponse) {
    // In streaming mode - show stop icon and enable button
    button.disabled = false;
    button.classList.add('streaming');
    const sendIcon = button.querySelector('.send-icon');
    const stopIcon = button.querySelector('.stop-icon');
    if (sendIcon) sendIcon.classList.add('hidden');
    if (stopIcon) stopIcon.classList.remove('hidden');
  } else {
    // Normal mode - show send icon
    button.disabled = !input.value.trim();
    button.classList.remove('streaming');
    const sendIcon = button.querySelector('.send-icon');
    const stopIcon = button.querySelector('.stop-icon');
    if (sendIcon) sendIcon.classList.remove('hidden');
    if (stopIcon) stopIcon.classList.add('hidden');
  }
}

// Stop the current streaming query
async function stopCurrentQuery() {
  if (!isWaitingForResponse || !currentChatId) return;

  console.log('[Chat] Stopping query for chatId:', currentChatId);

  // Abort the client-side fetch
  window.electronAPI.abortCurrentRequest();

  // Tell the backend to stop processing
  await window.electronAPI.stopQuery(currentChatId, selectedProvider);

  // Reset state
  isWaitingForResponse = false;
  updateSendButton(messageInput, chatSendBtn);
  updateSendButton(homeInput, homeSendBtn);

  // Remove loading indicator from last assistant message
  const lastMessage = chatMessages.lastElementChild;
  if (lastMessage && lastMessage.classList.contains('assistant')) {
    const loadingIndicator = lastMessage.querySelector('.loading-indicator');
    if (loadingIndicator) loadingIndicator.remove();

    // Add a note that the response was stopped
    const contentDiv = lastMessage.querySelector('.message-content');
    if (contentDiv) {
      const stoppedNote = document.createElement('p');
      stoppedNote.style.color = '#888';
      stoppedNote.style.fontStyle = 'italic';
      stoppedNote.textContent = '[Response stopped]';
      contentDiv.appendChild(stoppedNote);
    }
  }

  saveState();
}

// Handle key press
function handleKeyPress(e, form) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
}


function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// Reset textarea height after sending
function resetTextareaHeight(textarea) {
  textarea.style.height = 'auto';
}

// Switch to chat view
function switchToChatView() {
  showView('chat');
  messageInput.focus();
}

/**
 * Show a main content view: 'home' | 'chat' | 'settings' | 'database'.
 * Hides the others. When opening settings/database, stores current view for Back.
 */
function showView(viewName) {
  console.log('[showView] Switching to:', viewName);
  if (!useApi()) {
    showAuthView();
    showAuthError('Sign in is required to continue.');
    return;
  }

  // If auth flow is still visible for any reason, always dismiss it when switching app views.
  if (authView) {
    authView.classList.add('hidden');
  }

  // Update Navigation Rail active state
  document.querySelectorAll('.nav-rail-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Handle side panel visibility
  // Show for home, chat, reports, and jobs; hide entirely for vault/settings/database
  const sidebarEnabledViews = ['home', 'chat', 'reports', 'jobs'];
  const isSidebarEnabled = sidebarEnabledViews.includes(viewName);

  if (leftSidebar) {
    leftSidebar.classList.toggle('hidden', !isSidebarEnabled);
    if (isSidebarEnabled && leftSidebar.classList.contains('collapsed')) {
      toggleLeftSidebar();
    }
  }

  // Update sidebar content based on view
  const chatFoldersList = document.getElementById('chatFoldersList');
  const workflowFoldersList = document.getElementById('workflowFoldersList');
  const reportFoldersList = document.getElementById('reportFoldersList');
  const chatHistoryList = document.getElementById('chatHistoryList');

  if (viewName === 'home' || viewName === 'chat') {
    const titleEl = document.getElementById('sidebarFoldersTitle');
    if (titleEl) titleEl.textContent = 'Chat Folders';
    if (chatFoldersList) chatFoldersList.classList.remove('hidden');
    if (workflowFoldersList) workflowFoldersList.classList.add('hidden');
    if (reportFoldersList) reportFoldersList.classList.add('hidden');
    if (chatHistoryList) chatHistoryList.classList.remove('hidden');
    currentFolderType = 'chat';
    loadChatFolders();
  } else if (viewName === 'reports') {
    const titleEl = document.getElementById('sidebarFoldersTitle');
    if (titleEl) titleEl.textContent = 'Report Folders';
    if (chatFoldersList) chatFoldersList.classList.add('hidden');
    if (workflowFoldersList) workflowFoldersList.classList.add('hidden');
    if (reportFoldersList) reportFoldersList.classList.remove('hidden');
    if (chatHistoryList) chatHistoryList.classList.add('hidden');
    currentFolderType = 'report';
    loadFolders('report');
  } else if (viewName === 'jobs') {
    const titleEl = document.getElementById('sidebarFoldersTitle');
    console.log('[showView:jobs] titleEl found:', !!titleEl);
    if (titleEl) {
        titleEl.textContent = 'Workflow Folders';
        console.log('[showView:jobs] Set title to Workflow Folders');
    }
    if (chatFoldersList) chatFoldersList.classList.add('hidden');
    if (workflowFoldersList) workflowFoldersList.classList.remove('hidden');
    if (reportFoldersList) reportFoldersList.classList.add('hidden');
    if (chatHistoryList) chatHistoryList.classList.add('hidden');
    currentFolderType = 'job';
    loadFolders('job');
  } else {
    // Hide all lists for other views if sidebar is still open
    if (chatFoldersList) chatFoldersList.classList.add('hidden');
    if (workflowFoldersList) workflowFoldersList.classList.add('hidden');
    if (reportFoldersList) reportFoldersList.classList.add('hidden');
    if (chatHistoryList) chatHistoryList.classList.add('hidden');
  }

  homeView.classList.toggle('hidden', viewName !== 'home');
  chatView.classList.toggle('hidden', viewName !== 'chat');
  if (settingsView) settingsView.classList.toggle('hidden', viewName !== 'settings');
  const dbView = document.getElementById('dbView');
  if (dbView) dbView.classList.toggle('hidden', viewName !== 'database');
  const reportsView = document.getElementById('reportsView');
  if (reportsView) reportsView.classList.toggle('hidden', viewName !== 'reports');
  const jobsViewEl = document.getElementById('jobsView');
  if (jobsViewEl) jobsViewEl.classList.toggle('hidden', viewName !== 'jobs');
  if (vaultView) vaultView.classList.toggle('hidden', viewName !== 'vault');
  if (viewName === 'settings') {
    lastViewBeforeSettings = currentMainView;
    loadSettings();
  }
  if (viewName === 'database') {
    lastViewBeforeSettings = currentMainView;
    if (typeof window.dbExplorer !== 'undefined') window.dbExplorer.load();
  }
  if (viewName === 'reports') {
    lastViewBeforeSettings = currentMainView;
    initReportsView();
  }
  if (viewName === 'jobs') {
    lastViewBeforeSettings = currentMainView;
    initJobsView();
  }
  if (viewName === 'vault') {
    lastViewBeforeSettings = currentMainView;
    initVaultView();
  }
  currentMainView = viewName;
}

/** Open settings page (called from sidebar button). */
function openSettings() {
  showView('settings');
}

/** Close settings and return to previous view. */
function closeSettings() {
  showView(lastViewBeforeSettings);
}

// Handle form submission
async function handleSendMessage(e) {
  e.preventDefault();

  // If currently streaming, stop the query instead
  if (isWaitingForResponse) {
    await stopCurrentQuery();
    return;
  }

  // Determine which input was used based on the form that submitted,
  // not just isFirstMessage — this prevents the chat input from being
  // ignored when isFirstMessage is still true but the user typed in the chat view.
  const submittedViaChat = e && e.target && e.target.id === 'chatForm';
  // When called programmatically (e is a string), prefer messageInput if it has content.
  const isProgrammatic = typeof e === 'string';
  const input = (!isFirstMessage || submittedViaChat || isProgrammatic) ? messageInput : homeInput;
  const message = input.value.trim();

  if (!message) {
    return;
  }

  if (isFirstMessage && !submittedViaChat && !isProgrammatic) {
    // Always generate a new ID for a new conversation (sent from Home view)
    currentChatId = generateId();
    switchToChatView();
    isFirstMessage = false;
    chatTitle.textContent = message.length > 30 ? message.substring(0, 30) + '...' : message;
  } else if (!currentChatId) {
    currentChatId = generateId();
    if (isFirstMessage) {
      switchToChatView();
      isFirstMessage = false;
    }
    chatTitle.textContent = message.length > 30 ? message.substring(0, 30) + '...' : message;
  } else if (isFirstMessage && (submittedViaChat || isProgrammatic)) {
    // User typed in chat view despite isFirstMessage being true — treat as follow-up
    isFirstMessage = false;
  }

  // Add user message
  addUserMessage(message);

  input.value = '';
  resetTextareaHeight(input);

  // Set loading state
  isWaitingForResponse = true;

  // Update buttons to show stop icon
  updateSendButton(homeInput, homeSendBtn);
  updateSendButton(messageInput, chatSendBtn);

  // Create assistant message with loading state
  const assistantMessage = createAssistantMessage();
  const contentDiv = assistantMessage.querySelector('.message-content');

  // Declare heartbeatChecker outside try block so it's accessible in finally
  let heartbeatChecker = null;

  try {
    console.log('[Chat] Sending message to API...');
    // Pass chatId, provider, and model for session management
    const response = await window.electronAPI.sendMessage(message, currentChatId, selectedProvider, selectedModel);
    console.log('[Chat] Response received');

    const reader = await response.getReader();
    let buffer = '';
    let hasContent = false;
    let receivedStreamingText = false;
    const pendingToolCalls = new Map();

    let lastHeartbeat = Date.now();
    const heartbeatTimeout = 300000;
    let connectionLost = false;

    heartbeatChecker = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
      if (timeSinceLastHeartbeat > heartbeatTimeout) {
        console.warn('[Chat] No data received for 5 minutes - connection may be lost');
      }
    }, 30000); 

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[Chat] Stream complete');
          clearInterval(heartbeatChecker);
          // Always clear loading indicator on stream end, regardless of whether content was received
          const loadingIndicator = contentDiv.querySelector('.loading-indicator');
          if (loadingIndicator) {
            loadingIndicator.remove();
          }
          const actionsDiv = assistantMessage.querySelector('.message-actions');
          if (actionsDiv) {
            actionsDiv.classList.remove('hidden');
          }
          for (const [apiId, localId] of pendingToolCalls) {
            updateToolCallStatus(localId, 'success');
          }
          break;
        }

        lastHeartbeat = Date.now();

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];

          // Detect heartbeat comments from server
          if (line.startsWith(':')) {
            continue; // Skip SSE comments (heartbeats)
          }

          if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);

            // Debug: log all received events
            console.log('[Frontend] Received event:', data.type, data.name || '');

            if (data.type === 'done') {
              break;
            } else if (data.type === 'text' && data.content) {
              if (!hasContent) {
                const loadingIndicator = contentDiv.querySelector('.loading-indicator');
                if (loadingIndicator) loadingIndicator.remove();
              }
              hasContent = true;
              receivedStreamingText = true;
              if (data.isReasoning) {
                appendToThinking(contentDiv, data.content);
              } else {
                appendToContent(contentDiv, data.content);
              }
            } else if (data.type === 'tool_use') {
              const toolName = data.name || data.tool || 'Tool';
              const toolInput = data.input || {};
              const apiId = data.id; // API's tool ID
              const toolCall = addToolCall(toolName, toolInput, 'running');
              addInlineToolCall(contentDiv, toolName, toolInput, toolCall.id);
              if (apiId) {
                pendingToolCalls.set(apiId, toolCall.id);
              }

              if (toolName === 'TodoWrite' && toolInput.todos) {
                updateTodos(toolInput.todos);
              }

              // Extract artifacts from Write/Edit tool calls
              if ((toolName === 'Write' || toolName === 'Edit') && toolInput.file_path && toolInput.content) {
                const filePath = toolInput.file_path;
                const fileName = filePath.split('/').pop();
                const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
                const langMap = { py: 'python', js: 'javascript', ts: 'typescript', html: 'html', css: 'css', json: 'json', sh: 'bash', sql: 'sql', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php', c: 'c', cpp: 'cpp', swift: 'swift', kt: 'kotlin', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml' };
                const lang = langMap[ext] || ext || 'text';
                const code = toolInput.content;
                const alreadyTracked = [...artifactStore.values()].some(a => a.versions[0] === code);
                if (!alreadyTracked) {
                  const artId = 'art_' + (++artifactCounter);
                  const msgEl = contentDiv.closest('.message');
                  artifactStore.set(artId, {
                    id: artId, type: 'code', language: lang,
                    title: fileName,
                    versions: [code], currentVersion: 0,
                    messageId: msgEl?.dataset?.messageId || null
                  });
                  // Insert pill after the inline tool call element
                  const pill = document.createElement('button');
                  pill.className = 'artifact-pill';
                  pill.textContent = 'Open in editor: ' + fileName;
                  pill.dataset.artifactId = artId;
                  pill.addEventListener('click', () => openArtifactPanel(artId));
                  const toolDiv = contentDiv.querySelector(`.inline-tool-call[data-tool-id="${toolCall.id}"]`);
                  if (toolDiv) {
                    toolDiv.insertAdjacentElement('afterend', pill);
                  } else {
                    contentDiv.appendChild(pill);
                  }
                  openArtifactPanel(artId);
                }
              }

              hasContent = true;
            } else if (data.type === 'tool_result' || data.type === 'result') {
              const result = data.result || data.content || data;
              const apiId = data.tool_use_id;

              // Find the matching tool call by API ID
              const localId = apiId ? pendingToolCalls.get(apiId) : null;
              if (localId) {
                updateToolCallResult(localId, result);
                updateToolCallStatus(localId, 'success');
                updateInlineToolResult(localId, result);
                pendingToolCalls.delete(apiId);
              }

              if (!hasContent) {
                const loadingIndicator = contentDiv.querySelector('.loading-indicator');
                if (loadingIndicator) loadingIndicator.remove();
              }
              hasContent = true;
            } else if (data.type === 'permission_request') {
              showPermissionDialog(data.chatId, data.requestId, data.toolName, data.toolInput);
            } else if (data.type === 'subagent_start') {
              addSubagent(data.agent_id, data.agent_type, data.description);
              addInlineSubagentCard(contentDiv, data.agent_id, data.agent_type, data.description);
              hasContent = true;
            } else if (data.type === 'tool_progress') {
              updateSubagentProgress(data.parent_tool_use_id || data.tool_use_id, data.tool_name, data.elapsed_time_seconds);
            } else if (data.type === 'subagent_stop') {
              completeSubagent(data.agent_id, data.result);
              updateInlineSubagentComplete(data.agent_id);
            } else if (data.type === 'error') {
              // Server-sent error — clear loading spinner and show message inline
              const loadingIndicator = contentDiv.querySelector('.loading-indicator');
              if (loadingIndicator) loadingIndicator.remove();
              const errorMsg = data.message || 'An error occurred';
              const paragraph = document.createElement('p');
              paragraph.textContent = `Error: ${errorMsg}`;
              paragraph.style.color = '#c0392b';
              contentDiv.appendChild(paragraph);
              hasContent = true;
              break;
            } else if (data.type === 'assistant' && data.message) {
              if (data.message.content && Array.isArray(data.message.content)) {
                for (const block of data.message.content) {
                  if (block.type === 'tool_use') {
                    const toolName = block.name || 'Tool';
                    const toolInput = block.input || {};
                    const apiId = block.id; // API's tool ID
                    const toolCall = addToolCall(toolName, toolInput, 'running');
                    addInlineToolCall(contentDiv, toolName, toolInput, toolCall.id);
                    if (apiId) {
                      pendingToolCalls.set(apiId, toolCall.id);
                    }
                    // Extract artifacts from Write/Edit tool calls in assistant blocks
                    if ((toolName === 'Write' || toolName === 'Edit') && toolInput.file_path && toolInput.content) {
                      const filePath = toolInput.file_path;
                      const fileName = filePath.split('/').pop();
                      const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
                      const langMap = { py: 'python', js: 'javascript', ts: 'typescript', html: 'html', css: 'css', json: 'json', sh: 'bash', sql: 'sql', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php', c: 'c', cpp: 'cpp', swift: 'swift', kt: 'kotlin', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml' };
                      const lang = langMap[ext] || ext || 'text';
                      const code = toolInput.content;
                      const alreadyTracked = [...artifactStore.values()].some(a => a.versions[0] === code);
                      if (!alreadyTracked) {
                        const artId = 'art_' + (++artifactCounter);
                        const msgEl = contentDiv.closest('.message');
                        artifactStore.set(artId, {
                          id: artId, type: 'code', language: lang,
                          title: fileName,
                          versions: [code], currentVersion: 0,
                          messageId: msgEl?.dataset?.messageId || null
                        });
                        const pill = document.createElement('button');
                        pill.className = 'artifact-pill';
                        pill.textContent = 'Open in editor: ' + fileName;
                        pill.dataset.artifactId = artId;
                        pill.addEventListener('click', () => openArtifactPanel(artId));
                        const toolDiv = contentDiv.querySelector(`.inline-tool-call[data-tool-id="${toolCall.id}"]`);
                        if (toolDiv) {
                          toolDiv.insertAdjacentElement('afterend', pill);
                        } else {
                          contentDiv.appendChild(pill);
                        }
                        openArtifactPanel(artId);
                      }
                    }
                    hasContent = true;
                  } else if (block.type === 'text' && block.text) {
                    if (!receivedStreamingText) {
                      if (!hasContent) {
                        const loadingIndicator = contentDiv.querySelector('.loading-indicator');
                        if (loadingIndicator) loadingIndicator.remove();
                      }
                      hasContent = true;
                      appendToContent(contentDiv, block.text);
                    }
                  }
                }
              }

              if (data.message.content && Array.isArray(data.message.content)) {
                for (const block of data.message.content) {
                  if (block.type === 'tool_use' && block.name === 'TodoWrite') {
                    updateTodos(block.input.todos);
                  }
                }
              }
            }

            scrollToBottom();
          } catch (parseError) {
            // Silent fail on parse errors
          }
        }
      }
      }
    } catch (readerError) {
      if (readerError?.name === 'AbortError' || readerError?.message?.includes('aborted') || readerError?.message?.includes('abort')) {
        clearInterval(heartbeatChecker);
        return;
      }

      console.error('[Chat] Reader error:', readerError);
      clearInterval(heartbeatChecker);
      throw readerError; // Re-throw to outer catch
    }
  } catch (error) {
    clearInterval(heartbeatChecker);

    // Don't show error for aborted requests (user clicked stop or switched chats)
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('abort')) {
      console.log('[Chat] Request was aborted');
      return;
    }

    // Skip showing error if message is undefined or empty (likely an abort)
    if (!error?.message) {
      console.log('[Chat] Request ended without error message (likely aborted)');
      return;
    }

    console.error('[Chat] Error sending message:', error);
    showAppError(error.message || 'Failed to send message.');
    const loadingIndicator = contentDiv.querySelector('.loading-indicator');
    if (loadingIndicator) loadingIndicator.remove();

    const paragraph = document.createElement('p');
    paragraph.textContent = `Error: ${error.message}`;
    paragraph.style.color = '#c0392b';
    contentDiv.appendChild(paragraph);
  } finally {
    if (heartbeatChecker) {
      clearInterval(heartbeatChecker);
    }
    isWaitingForResponse = false;
    saveState();
    updateSendButton(messageInput, chatSendBtn);
    updateSendButton(homeInput, homeSendBtn);
    messageInput.focus();
  }
}

// Add user message to chat
function addUserMessage(text) {
  // Handle browser transition before adding message
  handleBrowserTransitionOnMessage();

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = text;

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
  saveState();
}

// Create assistant message with loading state
function createAssistantMessage() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-indicator';
  loadingDiv.innerHTML = `
    <svg class="loading-asterisk" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  contentDiv.appendChild(loadingDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions hidden';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-btn';
  copyBtn.type = 'button';
  copyBtn.title = 'Copy';
  copyBtn.setAttribute('aria-label', 'Copy assistant message');
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener('click', () => copyMessage(copyBtn));
  actionsDiv.appendChild(copyBtn);

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(actionsDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
  saveState();

  return messageDiv;
}

function appendToContent(contentDiv, content) {
  if (!contentDiv.dataset.rawContent) {
    contentDiv.dataset.rawContent = '';
  }
  contentDiv.dataset.rawContent += content;

  // Get current chunk container and append to it
  const container = getCurrentMarkdownContainer(contentDiv);
  container.dataset.rawContent += content;
  renderMarkdownContainer(container);

  // Detect completed artifacts in streamed content
  const detectedArts = detectArtifacts(contentDiv.dataset.rawContent);
  detectedArts.forEach(art => {
    // Check if this artifact content is already tracked (avoid duplicates across chunks)
    const alreadyTracked = [...artifactStore.values()].some(a => a.versions[0] === art.content);
    if (!alreadyTracked) {
      const msgEl = contentDiv.closest('.message');
      artifactStore.set(art.id, {
        id: art.id, type: art.type, language: art.language,
        title: art.title, versions: [art.content], currentVersion: 0,
        messageId: msgEl?.dataset?.messageId || null
      });
      injectArtifactPill(contentDiv, art);
      openArtifactPanel(art.id);
    }
  });

  // Check for Anchor Browser live URL in content
  const browserInfo = extractBrowserUrl(contentDiv.dataset.rawContent);
  if (browserInfo && !activeBrowserSession) {
    addInlineBrowserEmbed(contentDiv, browserInfo.url, browserInfo.sessionId);
  }

  saveState();
}

function appendToThinking(contentDiv, content) {
  // Find or create thinking section (collapsible, above main content)
  let thinkingSection = contentDiv.querySelector('.thinking-section');

  if (!thinkingSection) {
    thinkingSection = document.createElement('details');
    thinkingSection.className = 'thinking-section';
    thinkingSection.open = false; // Collapsed by default

    const summary = document.createElement('summary');
    summary.className = 'thinking-header';
    summary.innerHTML = '<span class="thinking-icon">&#x1F4AD;</span> Thinking...';
    thinkingSection.appendChild(summary);

    const thinkingContent = document.createElement('div');
    thinkingContent.className = 'thinking-content';
    thinkingContent.dataset.rawContent = '';
    thinkingSection.appendChild(thinkingContent);

    // Insert at the beginning of contentDiv
    contentDiv.insertBefore(thinkingSection, contentDiv.firstChild);
  }

  const thinkingContent = thinkingSection.querySelector('.thinking-content');
  thinkingContent.dataset.rawContent += content;

  // Render as plain text (no markdown for thinking)
  thinkingContent.textContent = thinkingContent.dataset.rawContent;

  // Update header to show it's still thinking
  const summary = thinkingSection.querySelector('.thinking-header');
  const thinkingLength = thinkingContent.dataset.rawContent.length;
  summary.innerHTML = `<span class="thinking-icon">&#x1F4AD;</span> Thinking (${thinkingLength} chars)`;
}

// Start a new chat
window.startNewChat = function() {
  // Abort any ongoing request from the previous chat
  if (isWaitingForResponse) {
    window.electronAPI.abortCurrentRequest();
    isWaitingForResponse = false;
  }

  if (currentChatId && chatMessages.children.length > 0) {
    saveState();
  }

  currentChatId = null;

  // Clear all state
  chatMessages.innerHTML = '';
  messageInput.value = '';
  homeInput.value = '';
  chatTitle.textContent = 'New chat';
  isFirstMessage = true;
  todos = [];
  toolCalls = [];
  attachedFiles = [];

  // Reset sidebar and artifacts
  stepsList.innerHTML = '';
  emptySteps.style.display = 'block';
  stepsCount.textContent = '0 steps';
  toolCallsList.innerHTML = '';
  emptyTools.style.display = 'block';
  activeSubagents.clear();
  clearSubagentsSidebar();
  clearArtifacts();

  // Switch back to home view
  showView('home');
  homeInput.focus();

  // Clear currentChatId from localStorage
  localStorage.removeItem('currentChatId');

  // Update chat history display
  renderChatHistory();

  // Update send button states to ensure they're enabled
  updateSendButton(homeInput, homeSendBtn);
  updateSendButton(messageInput, chatSendBtn);
}

// Get or create the current markdown container for streaming
function getCurrentMarkdownContainer(contentDiv) {
  const chunkIndex = parseInt(contentDiv.dataset.currentChunk || '0');
  let container = contentDiv.querySelector(`.markdown-content[data-chunk="${chunkIndex}"]`);

  if (!container) {
    container = document.createElement('div');
    container.className = 'markdown-content';
    container.dataset.chunk = chunkIndex;
    container.dataset.rawContent = '';
    contentDiv.appendChild(container);
  }

  return container;
}

// Render markdown content for a specific container
function renderMarkdownContainer(container) {
  const rawContent = container.dataset.rawContent || '';

  marked.setOptions({
    breaks: true,
    gfm: true
  });

  container.innerHTML = sanitizeHtml(marked.parse(rawContent));
}

// Legacy function for restoring saved messages
function renderMarkdown(contentDiv) {
  const rawContent = contentDiv.dataset.rawContent || '';

  marked.setOptions({
    breaks: true,
    gfm: true
  });

  let markdownContainer = contentDiv.querySelector('.markdown-content');
  if (!markdownContainer) {
    markdownContainer = document.createElement('div');
    markdownContainer.className = 'markdown-content';
    contentDiv.appendChild(markdownContainer);
  }

  markdownContainer.innerHTML = sanitizeHtml(marked.parse(rawContent));
}

function sanitizeHtml(html) {
  const source = html || '';
  if (typeof DOMPurify === 'undefined') return escapeHtml(source);
  return DOMPurify.sanitize(source);
}

function formatToolPreview(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return String(toolInput || '').substring(0, 50);
  }

  const keys = Object.keys(toolInput);
  if (keys.length === 0) return '';

  const previewKeys = ['pattern', 'command', 'file_path', 'path', 'query', 'content', 'description'];
  const key = previewKeys.find(k => toolInput[k]) || keys[0];
  const value = toolInput[key];

  if (typeof value === 'string') {
    return `${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`;
  } else if (Array.isArray(value)) {
    return `${key}: [${value.length} items]`;
  } else if (typeof value === 'object') {
    return `${key}: {...}`;
  }
  return `${key}: ${String(value).substring(0, 30)}`;
}

// Add inline tool call to message (maintains correct order in stream)
function addInlineToolCall(contentDiv, toolName, toolInput, toolId) {
  const toolDiv = document.createElement('div');
  toolDiv.className = 'inline-tool-call expanded'; // Show expanded by default
  toolDiv.dataset.toolId = toolId;

  const inputPreview = formatToolPreview(toolInput);
  const inputStr = JSON.stringify(toolInput, null, 2);

  const header = document.createElement('div');
  header.className = 'inline-tool-header';
  header.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
    <span class="tool-name"></span>
    <span class="tool-preview"></span>
    <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  header.querySelector('.tool-name').textContent = toolName || '';
  header.querySelector('.tool-preview').textContent = inputPreview || '';
  header.addEventListener('click', () => toggleInlineToolCall(header));

  const body = document.createElement('div');
  body.className = 'inline-tool-result';

  const inputSection = document.createElement('div');
  inputSection.className = 'tool-section';
  const inputLabel = document.createElement('div');
  inputLabel.className = 'tool-section-label';
  inputLabel.textContent = 'Input';

  const inputBlock = document.createElement('pre');
  inputBlock.innerHTML = escapeHtml(inputStr);

  inputSection.append(inputLabel, inputBlock);

  const outputSection = document.createElement('div');
  outputSection.className = 'tool-section tool-output-section';
  outputSection.style.display = 'none';
  const outputLabel = document.createElement('div');
  outputLabel.className = 'tool-section-label';
  outputLabel.textContent = 'Output';
  const outputBlock = document.createElement('pre');
  outputBlock.className = 'tool-output-content';

  outputSection.append(outputLabel, outputBlock);

  body.append(inputSection, outputSection);

  toolDiv.append(header, body);

  // Append tool call at end (in stream order)
  contentDiv.appendChild(toolDiv);

  // Increment chunk counter so next text creates a new markdown container
  const currentChunk = parseInt(contentDiv.dataset.currentChunk || '0');
  contentDiv.dataset.currentChunk = currentChunk + 1;
}

// Update inline tool result
function updateInlineToolResult(toolId, result) {
  const toolDiv = document.querySelector(`.inline-tool-call[data-tool-id="${toolId}"]`);
  if (toolDiv) {
    const outputSection = toolDiv.querySelector('.tool-output-section');
    const outputContent = toolDiv.querySelector('.tool-output-content');
    if (outputSection && outputContent) {
      // Check for screenshot image data (browser_screenshot returns base64 image)
      const toolName = toolDiv.querySelector('.tool-name')?.textContent || '';
      if (toolName === 'browser_screenshot' && result && typeof result === 'object') {
        const imgData = extractScreenshotData(result);
        if (imgData) {
          outputContent.textContent = '';
          const img = document.createElement('img');
          img.className = 'browser-screenshot-img';
          img.src = 'data:image/png;base64,' + imgData;
          img.alt = 'Browser screenshot';
          outputContent.appendChild(img);
          // Save to Vault button for screenshots
          if (window.electronAPI?.uploadVaultAsset) {
            const vaultBtn = document.createElement('button');
            vaultBtn.className = 'artifact-pill vault-save-pill';
            vaultBtn.style.marginTop = '6px';
            vaultBtn.textContent = 'Save to Vault';
            vaultBtn.addEventListener('click', async () => {
              try {
                vaultBtn.disabled = true;
                vaultBtn.textContent = 'Saving...';
                const binary = atob(imgData);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'image/png' });
                const filename = 'screenshot_' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
                const file = new File([blob], filename, { type: 'image/png' });
                await window.electronAPI.uploadVaultAsset(file, undefined, 'ai_generated');
                vaultBtn.textContent = 'Saved!';
                setTimeout(() => { vaultBtn.textContent = 'Save to Vault'; vaultBtn.disabled = false; }, 2000);
              } catch (err) {
                console.error('[VAULT] Save screenshot error:', err);
                vaultBtn.textContent = 'Save to Vault';
                vaultBtn.disabled = false;
              }
            });
            outputContent.appendChild(vaultBtn);
          }
          outputSection.style.display = 'block';
          return;
        }
      }

      // Check for document generation tool results
      if (['create_excel', 'create_powerpoint', 'create_pdf'].includes(toolName) && result) {
        let docResult = result;
        if (typeof docResult === 'string') {
          try {
            docResult = JSON.parse(docResult);
          } catch (_) {
            docResult = null;
          }
        }

        if (docResult && typeof docResult === 'object' && docResult.filePath) {
          const filename = String(docResult.filePath).split('/').pop().split('\\').pop();
          const sizeStr = docResult.fileSize ? (docResult.fileSize < 1024 ? `${docResult.fileSize} B` : `${(docResult.fileSize / 1024).toFixed(1)} KB`) : '';
          const iconMap = { create_excel: '\u{1F4CA}', create_powerpoint: '\u{1F4DD}', create_pdf: '\u{1F4C4}' };
          const icon = iconMap[toolName] || '\u{1F4C1}';

          const downloadUrl = typeof window.electronAPI?.getDocumentUrl === 'function'
            ? window.electronAPI.getDocumentUrl(filename)
            : '';

          const card = document.createElement('div');
          card.className = 'document-download-card';
          card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border-color,#333);border-radius:8px;background:var(--input-bg,#1e1e1e);margin:4px 0;';

          const iconEl = document.createElement('span');
          iconEl.style.fontSize = '1.6rem';
          iconEl.textContent = icon;

          const info = document.createElement('div');
          info.style.flex = '1';
          info.style.minWidth = '0';

          const fileNameEl = document.createElement('div');
          fileNameEl.style.fontWeight = '600';
          fileNameEl.style.overflow = 'hidden';
          fileNameEl.style.textOverflow = 'ellipsis';
          fileNameEl.style.whiteSpace = 'nowrap';
          fileNameEl.textContent = filename;
          info.appendChild(fileNameEl);

          if (sizeStr) {
            const sizeEl = document.createElement('div');
            sizeEl.style.fontSize = '0.8rem';
            sizeEl.style.opacity = '0.6';
            sizeEl.textContent = sizeStr;
            info.appendChild(sizeEl);
          }

          const downloadLink = document.createElement('a');
          downloadLink.textContent = 'Download';
          downloadLink.target = '_blank';
          downloadLink.rel = 'noopener noreferrer';
          downloadLink.download = filename;
          downloadLink.style.padding = '6px 14px';
          downloadLink.style.borderRadius = '6px';
          downloadLink.style.background = 'var(--accent-color,#6366f1)';
          downloadLink.style.color = '#fff';
          downloadLink.style.textDecoration = 'none';
          downloadLink.style.fontSize = '0.85rem';
          downloadLink.style.whiteSpace = 'nowrap';
          if (downloadUrl) {
            downloadLink.href = downloadUrl;
          }

          outputContent.textContent = '';
          card.append(iconEl, info, downloadLink);
          outputContent.appendChild(card);
          outputSection.style.display = 'block';
          return;
        }
      }

      const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      outputContent.textContent = resultStr.substring(0, 2000) + (resultStr.length > 2000 ? '...' : '');
      outputSection.style.display = 'block';

      // Check for Anchor Browser live URL in tool result
      const browserInfo = extractBrowserUrl(resultStr);
      if (browserInfo) {
        // Find the parent content div and add browser embed
        const contentDiv = toolDiv.closest('.message-content');
        if (contentDiv) {
          addInlineBrowserEmbed(contentDiv, browserInfo.url, browserInfo.sessionId);
        }
      }
    }
  }
}

// Extract base64 image data from screenshot tool result
function extractScreenshotData(result) {
  if (result.data && typeof result.data === 'string') return result.data;
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === 'image' && block.data) return block.data;
    }
  }
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      return extractScreenshotData(parsed);
    } catch (_) {}
  }
  return null;
}

// Toggle inline tool call expansion
window.toggleInlineToolCall = function(header) {
  const toolDiv = header.closest('.inline-tool-call');
  toolDiv.classList.toggle('expanded');
};

// Add tool call to sidebar
function addToolCall(name, input, status = 'running') {
  const id = 'tool_' + Date.now();
  const toolCall = { id, name, input, status, result: null };
  toolCalls.push(toolCall);

  emptyTools.style.display = 'none';

  const toolDiv = document.createElement('div');
  toolDiv.className = 'tool-call-item expanded'; // Show expanded by default
  toolDiv.dataset.toolId = id;

  const header = document.createElement('div');
  header.className = 'tool-call-header';
  header.innerHTML = `
    <div class="tool-call-icon ${status}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    </div>
    <div class="tool-call-info">
      <div class="tool-call-name"></div>
      <div class="tool-call-status"></div>
    </div>
    <div class="tool-call-expand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  `;
  header.querySelector('.tool-call-name').textContent = name || '';
  header.querySelector('.tool-call-status').textContent = status === 'running' ? 'Running...' : 'Completed';
  header.addEventListener('click', () => toggleToolCall(header));

  const details = document.createElement('div');
  details.className = 'tool-call-details';

  const inputSection = document.createElement('div');
  inputSection.className = 'tool-detail-section';
  const inputLabel = document.createElement('div');
  inputLabel.className = 'tool-detail-label';
  inputLabel.textContent = 'Input';
  const inputPre = document.createElement('pre');
  inputPre.innerHTML = escapeHtml(JSON.stringify(input, null, 2));
  inputSection.append(inputLabel, inputPre);

  const outputSection = document.createElement('div');
  outputSection.className = 'tool-detail-section tool-output-section';
  outputSection.style.display = 'none';
  const outputLabel = document.createElement('div');
  outputLabel.className = 'tool-detail-label';
  outputLabel.textContent = 'Output';
  const outputPre = document.createElement('pre');
  outputPre.className = 'sidebar-tool-output';
  outputSection.append(outputLabel, outputPre);

  details.append(inputSection, outputSection);

  toolDiv.append(header, details);

  toolCallsList.appendChild(toolDiv);
  return toolCall;
}

// Update tool call status
function updateToolCallStatus(toolId, status) {
  const toolDiv = document.querySelector(`.tool-call-item[data-tool-id="${toolId}"]`);
  if (toolDiv) {
    const icon = toolDiv.querySelector('.tool-call-icon');
    const statusText = toolDiv.querySelector('.tool-call-status');

    icon.className = `tool-call-icon ${status}`;
    statusText.textContent = status === 'success' ? 'Completed' : status === 'error' ? 'Failed' : 'Running...';
  }

  // Update in state
  const toolCall = toolCalls.find(t => t.id === toolId);
  if (toolCall) {
    toolCall.status = status;
  }
}

// Update tool call result
function updateToolCallResult(toolId, result) {
  const toolCall = toolCalls.find(t => t.id === toolId);
  if (toolCall) {
    toolCall.result = result;
  }

  // Update sidebar tool output
  const toolDiv = document.querySelector(`.tool-call-item[data-tool-id="${toolId}"]`);
  if (toolDiv) {
    const outputSection = toolDiv.querySelector('.tool-output-section');
    const outputContent = toolDiv.querySelector('.sidebar-tool-output');
    if (outputSection && outputContent) {
      const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      outputContent.textContent = resultStr.substring(0, 2000) + (resultStr.length > 2000 ? '...' : '');
      outputSection.style.display = 'block';
    }
  }
}

// ── Sub-Agent UI functions ──────────────────────────────────────────

function ensureSubagentsSidebarSection() {
  let section = document.getElementById('subagentsSection');
  if (!section && progressPanel) {
    section = document.createElement('div');
    section.id = 'subagentsSection';
    section.className = 'sidebar-section subagents-section';
    section.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      <span>Sub-Agents</span>
      <span id="subagentsCount" style="margin-left:auto;font-size:0.72rem;color:var(--text-secondary,#a0a0a0)">0 agents</span>
    `;

    const list = document.createElement('div');
    list.id = 'subagentsList';
    list.className = 'subagents-list';

    section.append(header, list);
    progressPanel.appendChild(section);
  }

  const list = document.getElementById('subagentsList');
  const countEl = document.getElementById('subagentsCount');

  if (!list && section && !section.querySelector('.subagents-list')) {
    const fallbackList = document.createElement('div');
    fallbackList.id = 'subagentsList';
    fallbackList.className = 'subagents-list';
    section.appendChild(fallbackList);
  }

  return {
    section,
    list: document.getElementById('subagentsList'),
    countEl
  };
}

function addSubagent(agentId, agentType, description) {
  const entry = {
    id: agentId,
    type: agentType || 'general',
    description: description || '',
    startTime: Date.now(),
    currentTool: null,
    elapsedSeconds: 0
  };
  activeSubagents.set(agentId, entry);

  // Show the sidebar section
  const subagentUI = ensureSubagentsSidebarSection();
  if (!subagentUI.section) return;
  subagentUI.section.style.display = '';

  // Update count
  updateSubagentCount();

  // Add sidebar entry
  const list = subagentUI.list;
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'subagent-item running';
  div.dataset.agentId = agentId;
  div.innerHTML = `
    <div class="subagent-header">
      <div class="subagent-icon running">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path>
        </svg>
      </div>
      <div class="subagent-info">
        <div class="subagent-type">${escapeHtml(entry.type)}</div>
        <div class="subagent-desc">${escapeHtml(entry.description)}</div>
      </div>
    </div>
    <div class="subagent-progress">
      <span class="subagent-tool">Starting...</span>
      <span class="subagent-elapsed">0s</span>
    </div>
  `;
  list.appendChild(div);
}

function updateSubagentProgress(agentId, toolName, elapsedSeconds) {
  const entry = activeSubagents.get(agentId);
  if (entry) {
    entry.currentTool = toolName;
    if (elapsedSeconds != null) entry.elapsedSeconds = elapsedSeconds;
  }

  // Update sidebar
  const div = document.querySelector(`.subagent-item[data-agent-id="${agentId}"]`);
  if (div) {
    const toolEl = div.querySelector('.subagent-tool');
    const elapsedEl = div.querySelector('.subagent-elapsed');
    if (toolEl && toolName) toolEl.textContent = toolName;
    if (elapsedEl && elapsedSeconds != null) elapsedEl.textContent = formatElapsed(elapsedSeconds);
  }

  // Update inline card
  const card = document.querySelector(`.inline-subagent-card[data-agent-id="${agentId}"]`);
  if (card) {
    const toolEl = card.querySelector('.subagent-card-tool');
    const elapsedEl = card.querySelector('.subagent-card-elapsed');
    if (toolEl && toolName) toolEl.textContent = toolName;
    if (elapsedEl && elapsedSeconds != null) elapsedEl.textContent = formatElapsed(elapsedSeconds);
  }
}

function completeSubagent(agentId) {
  const entry = activeSubagents.get(agentId);
  if (entry) {
    entry.elapsedSeconds = (Date.now() - entry.startTime) / 1000;
  }
  activeSubagents.delete(agentId);

  // Update sidebar entry
  const div = document.querySelector(`.subagent-item[data-agent-id="${agentId}"]`);
  if (div) {
    div.classList.remove('running');
    div.classList.add('completed');
    const icon = div.querySelector('.subagent-icon');
    if (icon) {
      icon.className = 'subagent-icon completed';
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
    const toolEl = div.querySelector('.subagent-tool');
    if (toolEl) toolEl.textContent = 'Done';
    const elapsedEl = div.querySelector('.subagent-elapsed');
    if (elapsedEl && entry) elapsedEl.textContent = formatElapsed(entry.elapsedSeconds);
  }

  updateSubagentCount();
}

function addInlineSubagentCard(contentDiv, agentId, agentType, description) {
  const card = document.createElement('div');
  card.className = 'inline-subagent-card';
  card.dataset.agentId = agentId;
  card.innerHTML = `
    <div class="subagent-card-header">
      <span class="subagent-card-icon running"></span>
      <span class="subagent-card-type">${escapeHtml(agentType || 'general')}</span>
      <span class="subagent-card-desc">${escapeHtml(description || '')}</span>
    </div>
    <div class="subagent-card-progress">
      <span class="subagent-card-tool">Starting...</span>
      <span class="subagent-card-elapsed">0s</span>
    </div>
  `;
  contentDiv.appendChild(card);

  // Increment chunk counter so next text creates a new markdown container
  const currentChunk = parseInt(contentDiv.dataset.currentChunk || '0');
  contentDiv.dataset.currentChunk = currentChunk + 1;
}

function updateInlineSubagentComplete(agentId) {
  const card = document.querySelector(`.inline-subagent-card[data-agent-id="${agentId}"]`);
  if (card) {
    const icon = card.querySelector('.subagent-card-icon');
    if (icon) {
      icon.classList.remove('running');
      icon.classList.add('completed');
    }
    const toolEl = card.querySelector('.subagent-card-tool');
    if (toolEl) toolEl.textContent = 'Completed';
  }
}

function updateSubagentCount() {
  const countEl = ensureSubagentsSidebarSection().countEl;
  if (!countEl) return;
  const running = activeSubagents.size;
  const total = document.querySelectorAll('.subagent-item').length;
  countEl.textContent = running > 0 ? `${running} running` : `${total} agent${total !== 1 ? 's' : ''}`;
}

function clearSubagentsSidebar() {
  const subagentUI = ensureSubagentsSidebarSection();
  const list = subagentUI.list;
  if (list) list.innerHTML = '';
  const section = subagentUI.section;
  if (section) section.style.display = 'none';
  const countEl = subagentUI.countEl;
  if (countEl) countEl.textContent = '0 agents';
}

function formatElapsed(seconds) {
  if (seconds < 60) return Math.round(seconds) + 's';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

// Toggle tool call expansion in sidebar
window.toggleToolCall = function(header) {
  const toolDiv = header.closest('.tool-call-item');
  toolDiv.classList.toggle('expanded');
};

// Update todos from TodoWrite
function updateTodos(newTodos) {
  todos = newTodos;
  renderTodos();
}

// Render todos in sidebar
function renderTodos() {
  stepsList.innerHTML = '';

  if (todos.length === 0) {
    emptySteps.style.display = 'block';
    stepsCount.textContent = '0 steps';
    return;
  }

  emptySteps.style.display = 'none';
  stepsCount.textContent = `${todos.length} steps`;

  todos.forEach((todo) => {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step-item';

    const statusIcon = todo.status === 'completed'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : todo.status === 'in_progress'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>'
      : '';

    const displayText = todo.status === 'in_progress' ? (todo.activeForm || todo.content) : todo.content;

    stepDiv.innerHTML = `
      <div class="step-status ${todo.status}">${statusIcon}</div>
      <div class="step-content">
        <div class="step-text">${escapeHtml(displayText)}</div>
      </div>
    `;

    stepsList.appendChild(stepDiv);
  });
}

// Escape HTML for safe display
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Copy message to clipboard
function copyMessage(button) {
  const messageDiv = button.closest('.message');
  const contentDiv = messageDiv.querySelector('.message-content');
  const text = contentDiv.dataset.rawContent || contentDiv.textContent;

  navigator.clipboard.writeText(text).then(() => {
    button.style.color = '#27ae60';
    setTimeout(() => {
      button.style.color = '';
    }, 1000);
  });
}

window.copyMessage = copyMessage;

// Get conversation history for context
function getConversationHistory() {
  const messages = Array.from(chatMessages.children);
  const history = [];

  // Skip the last message (current assistant loading state)
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const contentDiv = msg.querySelector('.message-content');
    if (!contentDiv) continue;

    const content = contentDiv.dataset.rawContent || contentDiv.textContent || '';
    if (!content.trim()) continue;

    if (msg.classList.contains('user')) {
      history.push({ role: 'user', content });
    } else if (msg.classList.contains('assistant')) {
      history.push({ role: 'assistant', content });
    }
  }

  return history;
}

// Scroll to bottom of messages
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==================== BROWSER EMBED FUNCTIONS ====================

// Check if a string contains an Anchor Browser live URL
function extractBrowserUrl(text) {
  const regex = /https:\/\/live\.anchorbrowser\.io\?sessionId=([a-f0-9-]+)/i;
  const match = text.match(regex);
  if (match) {
    return { url: match[0], sessionId: match[1] };
  }
  return null;
}

// Create inline browser embed in chat
function addInlineBrowserEmbed(contentDiv, url, sessionId) {
  const safeUrl = typeof url === 'string' && /^https:\/\/live\.anchorbrowser\.io\?sessionId=/.test(url) ? url : '';

  // Remove any existing inline browser embeds (only one at a time)
  const existingEmbed = document.querySelector('.inline-browser-embed');
  if (existingEmbed) {
    existingEmbed.remove();
  }

  const browserDiv = document.createElement('div');
  browserDiv.className = 'inline-browser-embed';
  browserDiv.dataset.sessionId = sessionId;
  browserDiv.dataset.url = safeUrl;

  const header = document.createElement('div');
  header.className = 'browser-embed-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'browser-header-left';
  headerLeft.innerHTML = `
    <svg class="browser-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
  `;

  const title = document.createElement('span');
  title.className = 'browser-title';
  title.textContent = 'Live Browser';
  const badge = document.createElement('span');
  badge.className = 'browser-session-badge';
  badge.textContent = 'Session Active';

  const headerActions = document.createElement('div');
  headerActions.className = 'browser-header-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'browser-action-btn';
  openBtn.title = 'Open in new window';
  openBtn.setAttribute('aria-label', 'Open in new window');
  openBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  `;
  openBtn.addEventListener('click', () => openBrowserInNewWindow(safeUrl));

  const sidebarBtn = document.createElement('button');
  sidebarBtn.type = 'button';
  sidebarBtn.className = 'browser-action-btn';
  sidebarBtn.title = 'Move to sidebar';
  sidebarBtn.setAttribute('aria-label', 'Move browser to sidebar');
  sidebarBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="15" y1="3" x2="15" y2="21"></line>
    </svg>
  `;
  sidebarBtn.addEventListener('click', moveBrowserToSidebar);

  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.type = 'button';
  fullscreenBtn.className = 'browser-action-btn browser-fullscreen-btn';
  fullscreenBtn.title = 'Fullscreen';
  fullscreenBtn.setAttribute('aria-label', 'Toggle browser fullscreen');
  fullscreenBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="15 3 21 3 21 9"></polyline>
      <polyline points="9 21 3 21 3 15"></polyline>
      <line x1="21" y1="3" x2="14" y2="10"></line>
      <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>
  `;
  fullscreenBtn.addEventListener('click', () => toggleBrowserFullscreen(fullscreenBtn));

  const content = document.createElement('div');
  content.className = 'browser-embed-content';

  const iframe = document.createElement('iframe');
  iframe.className = 'browser-iframe';
  iframe.src = safeUrl || '';
  iframe.allow = 'clipboard-read; clipboard-write; camera; microphone';
  iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals';

  const footer = document.createElement('div');
  footer.className = 'browser-embed-footer';
  const urlText = document.createElement('span');
  urlText.className = 'browser-url';
  urlText.textContent = safeUrl || '';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'browser-copy-url';
  copyBtn.title = 'Copy URL';
  copyBtn.setAttribute('aria-label', 'Copy browser URL');
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener('click', () => copyBrowserUrl(safeUrl, copyBtn));

  header.append(headerLeft, title, badge, headerActions);
  headerActions.append(openBtn, sidebarBtn, fullscreenBtn);
  content.appendChild(iframe);
  footer.append(urlText, copyBtn);
  browserDiv.append(header, content, footer);

  // Store active session
  activeBrowserSession = {
    url: safeUrl,
    sessionId: sessionId,
    inlineElement: browserDiv
  };
  browserDisplayMode = 'inline';

  // Append to content
  contentDiv.appendChild(browserDiv);

  // Increment chunk counter
  const currentChunk = parseInt(contentDiv.dataset.currentChunk || '0');
  contentDiv.dataset.currentChunk = currentChunk + 1;

  scrollToBottom();
}

// Move browser from inline to sidebar
function moveBrowserToSidebar() {
  if (!activeBrowserSession) return;

  // Remove inline embed
  if (activeBrowserSession.inlineElement) {
    activeBrowserSession.inlineElement.remove();
  }

  // Show browser in sidebar
  showBrowserInSidebar(activeBrowserSession.url, activeBrowserSession.sessionId);
  browserDisplayMode = 'sidebar';
}

// Show browser in sidebar panel
function showBrowserInSidebar(url, sessionId) {
  const safeUrl = /^https:\/\/live\.anchorbrowser\.io\?sessionId=/.test(url || '') ? String(url) : '';
  // Check if browser section already exists
  let browserSection = document.getElementById('browserSection');

  if (!browserSection) {
    // Create browser section in sidebar
    browserSection = document.createElement('div');
    browserSection.id = 'browserSection';
    browserSection.className = 'sidebar-section browser-section';
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header browser-section-header';
    sectionHeader.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
      <span>Live Browser</span>
    `;

    const actionWrap = document.createElement('div');
    actionWrap.className = 'browser-sidebar-actions';

    const inlineBtn = document.createElement('button');
    inlineBtn.type = 'button';
    inlineBtn.className = 'browser-sidebar-btn';
    inlineBtn.title = 'Show inline';
    inlineBtn.setAttribute('aria-label', 'Show browser inline');
    inlineBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
      </svg>
    `;
    inlineBtn.addEventListener('click', moveBrowserToInline);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'browser-sidebar-btn';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close browser');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.addEventListener('click', closeBrowserSession);

    actionWrap.append(inlineBtn, closeBtn);
    sectionHeader.appendChild(actionWrap);

    const browserContent = document.createElement('div');
    browserContent.className = 'browser-sidebar-content';
    const sidebarIframe = document.createElement('iframe');
    sidebarIframe.className = 'browser-sidebar-iframe';
    sidebarIframe.allow = 'clipboard-read; clipboard-write; camera; microphone';
    sidebarIframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals';
    sidebarIframe.src = safeUrl || '';
    browserContent.appendChild(sidebarIframe);

    browserSection.append(sectionHeader, browserContent);

    // Insert before tool calls section
    const toolCallsSection = sidebar.querySelector('.sidebar-section:last-child');
    sidebar.insertBefore(browserSection, toolCallsSection);
  } else {
    // Update existing iframe
    const iframe = browserSection.querySelector('.browser-sidebar-iframe');
    if (iframe) {
      iframe.src = safeUrl || '';
    }
  }

  // Ensure sidebar is visible
  sidebar.classList.remove('collapsed');

  // Update session reference
  activeBrowserSession = {
    ...activeBrowserSession,
    url: safeUrl,
    sessionId: sessionId,
    sidebarElement: browserSection
  };
}

// Move browser back to inline (in the last assistant message)
window.moveBrowserToInline = function() {
  if (!activeBrowserSession) return;

  // Remove from sidebar
  const browserSection = document.getElementById('browserSection');
  if (browserSection) {
    browserSection.remove();
  }

  // Find the last assistant message content div
  const lastAssistantMessage = chatMessages.querySelector('.message.assistant:last-child .message-content');
  if (lastAssistantMessage && activeBrowserSession.url) {
    addInlineBrowserEmbed(lastAssistantMessage, activeBrowserSession.url, activeBrowserSession.sessionId);
  }

  browserDisplayMode = 'inline';
}

// Close browser session
window.closeBrowserSession = function() {
  // Remove inline embed
  const inlineEmbed = document.querySelector('.inline-browser-embed');
  if (inlineEmbed) {
    inlineEmbed.remove();
  }

  // Remove sidebar section
  const browserSection = document.getElementById('browserSection');
  if (browserSection) {
    browserSection.remove();
  }

  activeBrowserSession = null;
  browserDisplayMode = 'hidden';
}

// Open browser in new window
window.openBrowserInNewWindow = function(url) {
  if (!url) return;
  window.open(url, '_blank', 'width=1200,height=800');
}

// Toggle browser fullscreen
window.toggleBrowserFullscreen = function(button) {
  const embedDiv = button.closest('.inline-browser-embed');
  if (embedDiv) {
    embedDiv.classList.toggle('fullscreen');

    // Update icon
    const svg = button.querySelector('svg');
    if (embedDiv.classList.contains('fullscreen')) {
      svg.innerHTML = `
        <polyline points="4 14 10 14 10 20"></polyline>
        <polyline points="20 10 14 10 14 4"></polyline>
        <line x1="14" y1="10" x2="21" y2="3"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      `;
    } else {
      svg.innerHTML = `
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      `;
    }
  }
}

// Copy browser URL
window.copyBrowserUrl = function(url, button) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    // Show brief feedback
    const btn = button || document.querySelector('.browser-copy-url');
    if (btn) {
      btn.style.color = '#4ade80';
      setTimeout(() => {
        btn.style.color = '';
      }, 1000);
    }
  });
}

// Handle transition when user sends a new message while browser is inline
function handleBrowserTransitionOnMessage() {
  if (activeBrowserSession && browserDisplayMode === 'inline') {
    // Move browser to sidebar when user sends a new message
    moveBrowserToSidebar();
  }
}

// ==================== SEMANTIC SEARCH ====================

let searchDebounceTimer = null;

function setupSearchListeners() {
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value.trim();

    if (!query) {
      hideSearchResults();
      return;
    }

    searchDebounceTimer = setTimeout(() => performSearch(query), 400);
  });

  // Close search results on Escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      hideSearchResults();
      searchInput.blur();
    }
  });
}

async function performSearch(query) {
  if (!useApi()) return;

  try {
    const res = await fetch(apiBase() + '/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ query, matchCount: 10 })
    });

    if (!res.ok) {
      hideSearchResults();
      return;
    }

    const data = await res.json();
    renderSearchResults(data.results || []);
  } catch {
    hideSearchResults();
  }
}

function renderSearchResults(results) {
  if (!searchResults) return;

  if (!results.length) {
    searchResults.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-tertiary);">No results found</div>';
    searchResults.classList.remove('hidden');
    return;
  }

  searchResults.textContent = '';
  const fragment = document.createDocumentFragment();

  results.forEach((r) => {
    const score = Math.round((r.similarity || 0) * 100);
    const preview = typeof r.content_preview === 'string' ? r.content_preview.substring(0, 80) : '';
    const sourceType = r.source_type || '';
    const sourceId = r.source_id || '';
    const sourceLabel = sourceType === 'attachment' ? 'file' : 'message';

    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.sourceType = String(sourceType);
    item.dataset.sourceId = String(sourceId);

    const scoreEl = document.createElement('span');
    scoreEl.className = 'search-result-score';
    scoreEl.textContent = `${score}%`;

    const previewEl = document.createElement('div');
    previewEl.textContent = `${sourceLabel}: ${preview}`;

    item.append(scoreEl, previewEl);
    item.addEventListener('click', () => {
      if (sourceType === 'message') {
        // Find which chat contains this message
        const chat = allChats.find(c => c.messages && c.messages.some(m => m.id === sourceId));
        if (chat) {
          loadChat(chat.id);
        }
      }
      searchInput.value = '';
      hideSearchResults();
    });
    fragment.appendChild(item);
  });

  searchResults.appendChild(fragment);
  searchResults.classList.remove('hidden');
}

function hideSearchResults() {
  if (searchResults) {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
  }
}

// ==================== REPORTS VIEW ====================

// HTML-escape helper to prevent XSS when interpolating dynamic values
function escHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

let reportChartInstances = new Map();
let currentReportId = null;
let reportsInitialized = false;

function initReportsView() {
  if (!reportsInitialized) {
    reportsInitialized = true;
    setupReportsEventListeners();
  }
  // Show unavailable message when not authenticated
  const unavailable = document.getElementById('reportsUnavailable');
  if (unavailable) unavailable.classList.toggle('hidden', !shouldShowAuthRequiredUnavailable());
  showReportsListView();
}

function setupReportsEventListeners() {
  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const tpl = card.dataset.template;
      if (tpl === 'custom') {
        openReportBuilder(null);
      } else {
        openReportBuilder(getTemplateConfig(tpl));
      }
    });
  });

  const newReportBtn = document.getElementById('reportsNewBtn');
  if (newReportBtn) newReportBtn.addEventListener('click', () => openReportBuilder(null));

  const runBtn = document.getElementById('builderRunBtn');
  if (runBtn) runBtn.addEventListener('click', () => runCurrentReport());

  const saveBtn = document.getElementById('builderSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveCurrentReport());
}

function getTemplateConfig(template) {
  const configs = {
    usage_over_time: { source: 'messages', groupBy: 'day', chartType: 'line', metrics: ['count'], template: 'usage_over_time' },
    provider_breakdown: { source: 'messages', groupBy: 'provider', chartType: 'doughnut', metrics: ['count'], template: 'provider_breakdown' },
    tool_usage: { source: 'tool_calls', groupBy: 'tool', chartType: 'bar', metrics: ['count'], template: 'tool_usage' },
    chat_summary: { source: 'messages', groupBy: 'none', chartType: 'table', metrics: ['count'], template: 'chat_summary' }
  };
  return configs[template] || null;
}

function showReportsListView() {
  const listView = document.getElementById('reportsListView');
  const builderView = document.getElementById('reportsBuilderView');
  if (listView) listView.classList.remove('hidden');
  if (builderView) builderView.classList.add('hidden');
  currentReportId = null;
  loadReportSummary();
  loadSavedReports();
}

function showReportsBuilderView() {
  const listView = document.getElementById('reportsListView');
  const builderView = document.getElementById('reportsBuilderView');
  if (listView) listView.classList.add('hidden');
  if (builderView) builderView.classList.remove('hidden');
}

function openReportBuilder(config) {
  showReportsBuilderView();
  const nameInput = document.getElementById('builderReportName');
  const sourceSelect = document.getElementById('builderSource');
  const groupBySelect = document.getElementById('builderGroupBy');
  const chartTypeSelect = document.getElementById('builderChartType');
  const dateRange = document.getElementById('builderDays');

  if (config) {
    if (nameInput) nameInput.value = config.name || (config.template ? config.template.replace(/_/g, ' ') : '');
    if (sourceSelect) sourceSelect.value = config.source || 'messages';
    if (groupBySelect) groupBySelect.value = config.groupBy || 'day';
    if (chartTypeSelect) chartTypeSelect.value = config.chartType || 'line';
    if (dateRange) dateRange.value = config.dateRange || '30';
  } else {
    if (nameInput) nameInput.value = '';
    if (sourceSelect) sourceSelect.value = 'messages';
    if (groupBySelect) groupBySelect.value = 'day';
    if (chartTypeSelect) chartTypeSelect.value = 'line';
    if (dateRange) dateRange.value = '30';
  }
  const canvas = document.getElementById('reportChart');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  const tableContainer = document.getElementById('reportTableContainer');
  if (tableContainer) tableContainer.textContent = '';
  const noData = document.getElementById('reportNoData');
  if (noData) noData.classList.add('hidden');
}

function getBuilderConfig() {
  return {
    source: document.getElementById('builderSource')?.value || 'messages',
    groupBy: document.getElementById('builderGroupBy')?.value || 'day',
    chartType: document.getElementById('builderChartType')?.value || 'line',
    dateRange: document.getElementById('builderDays')?.value || '30',
    metrics: ['count']
  };
}

async function runCurrentReport() {
  if (!useApi()) return;
  const config = getBuilderConfig();
  const runBtn = document.getElementById('builderRunBtn');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running...'; }

  try {
    let data;
    if (config.source === 'messages' && config.groupBy === 'day' && config.chartType === 'line') {
      data = await window.electronAPI.getReportDailyMessages(parseInt(config.dateRange) || 30);
    } else if (config.source === 'messages' && config.groupBy === 'provider') {
      data = await window.electronAPI.getReportProviderUsage(parseInt(config.dateRange) || 30);
    } else if (config.source === 'tool_calls') {
      data = await window.electronAPI.getReportToolUsage(parseInt(config.dateRange) || 30);
    } else if (config.chartType === 'table' && config.groupBy === 'none') {
      data = await window.electronAPI.getReportSummary();
    } else {
      data = await window.electronAPI.executeReportQuery(config);
    }
    renderReportResult(config, data);
  } catch (err) {
    console.error('Report error:', err);
    const tableContainer = document.getElementById('reportTableContainer');
    if (tableContainer) tableContainer.textContent = 'Error: ' + err.message;
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run'; }
  }
}

function renderReportResult(config, data) {
  const chartContainer = document.getElementById('reportChartContainer');
  const tableContainer = document.getElementById('reportTableContainer');
  const canvas = document.getElementById('reportChart');

  if (config.chartType === 'table' || !window.Chart) {
    if (chartContainer) chartContainer.classList.add('hidden');
    if (tableContainer) { tableContainer.classList.remove('hidden'); renderReportTable(tableContainer, data); }
  } else {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (chartContainer) chartContainer.classList.remove('hidden');
    if (canvas) renderReportChart(canvas, config.chartType, data);
  }
}

function renderReportTable(container, data) {
  container.textContent = '';
  if (!data) { container.textContent = 'No data'; return; }
  // Summary object (key-value)
  if (data.total_chats !== undefined || data.total_messages !== undefined) {
    const cards = document.createElement('div');
    cards.className = 'report-summary-cards';
    [
      { value: data.total_chats || 0, label: 'Chats' },
      { value: data.total_messages || 0, label: 'Messages' },
      { value: data.active_days || 0, label: 'Active Days' },
      { value: Number(data.avg_messages_per_day || 0).toFixed(1), label: 'Avg/Day' }
    ].forEach(item => {
      const card = document.createElement('div');
      card.className = 'report-summary-card';
      const val = document.createElement('div');
      val.className = 'report-summary-value';
      val.textContent = item.value;
      const lbl = document.createElement('div');
      lbl.className = 'report-summary-label';
      lbl.textContent = item.label;
      card.appendChild(val);
      card.appendChild(lbl);
      cards.appendChild(card);
    });
    container.appendChild(cards);
    return;
  }
  // Array data → table
  const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
  if (!rows.length) { container.textContent = 'No data returned'; return; }
  const keys = Object.keys(rows[0]);
  const table = document.createElement('table');
  table.className = 'report-data-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  keys.forEach(k => { const th = document.createElement('th'); th.textContent = k.replace(/_/g, ' '); headRow.appendChild(th); });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    keys.forEach(k => { const td = document.createElement('td'); td.textContent = row[k] !== null ? row[k] : ''; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderReportChart(canvas, chartType, data) {
  const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
  if (!rows.length) return;

  const existing = reportChartInstances.get(canvas.id);
  if (existing) existing.destroy();

  const keys = Object.keys(rows[0]);
  const labelKey = keys[0];
  const valueKeys = keys.slice(1);
  const labels = rows.map(r => r[labelKey]);
  const colorPalette = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];

  const datasets = valueKeys.map((vk, i) => ({
    label: vk.replace(/_/g, ' '),
    data: rows.map(r => Number(r[vk]) || 0),
    backgroundColor: chartType === 'doughnut' ? colorPalette : colorPalette[i % colorPalette.length],
    borderColor: chartType === 'line' ? colorPalette[i % colorPalette.length] : undefined,
    borderWidth: chartType === 'line' ? 2 : 1,
    fill: chartType === 'line' ? false : undefined,
    tension: 0.3
  }));

  const mappedType = chartType === 'horizontalBar' ? 'bar' : chartType;
  const chart = new window.Chart(canvas.getContext('2d'), {
    type: mappedType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: chartType === 'horizontalBar' ? 'y' : 'x',
      plugins: { legend: { display: valueKeys.length > 1 || chartType === 'doughnut' } },
      scales: chartType === 'doughnut' ? {} : {
        y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        x: { ticks: { color: '#9ca3af', maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
  reportChartInstances.set(canvas.id, chart);
}

async function saveCurrentReport() {
  if (!useApi()) return;
  const name = document.getElementById('builderReportName')?.value?.trim();
  if (!name) { showAppError('Please enter a report name'); return; }
  const config = getBuilderConfig();
  const saveBtn = document.getElementById('builderSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    if (currentReportId) {
      await window.electronAPI.updateSavedReport(currentReportId, { name, report_config: config });
    } else {
      const result = await window.electronAPI.createSavedReport({ name, report_config: config });
      currentReportId = result.id;
    }
    if (saveBtn) saveBtn.textContent = 'Saved!';
    setTimeout(() => { if (saveBtn) saveBtn.textContent = 'Save'; }, 1500);
  } catch (err) {
    console.error('Save report error:', err);
    if (saveBtn) saveBtn.textContent = 'Save';
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function loadReportSummary() {
  if (!useApi()) return;
  try {
    const data = await window.electronAPI.getReportSummary();
    const chatsEl = document.getElementById('reportStatChats');
    const msgsEl = document.getElementById('reportStatMessages');
    const daysEl = document.getElementById('reportStatDays');
    const avgEl = document.getElementById('reportStatAvg');
    if (chatsEl) chatsEl.textContent = data.total_chats || 0;
    if (msgsEl) msgsEl.textContent = data.total_messages || 0;
    if (daysEl) daysEl.textContent = data.active_days || 0;
    if (avgEl) avgEl.textContent = Number(data.avg_messages_per_day || 0).toFixed(1);
  } catch (err) {
    // Show unavailable message when Supabase is not connected
    const unavailable = document.getElementById('reportsUnavailable');
    if (unavailable) unavailable.classList.remove('hidden');
  }
}

async function loadSavedReports() {
  if (!useApi()) return;
  const container = document.getElementById('savedReportsList');
  if (!container) return;
  try {
    const reports = await window.electronAPI.getSavedReports();
    allReports = Array.isArray(reports) ? reports : (reports.data || []);
    renderReportFolders();
    const list = allReports.filter(r => !r.folder_id);
    container.textContent = '';
    if (!list.length) {
      container.textContent = 'No saved reports yet. Create one from a template or build custom.';
      return;
    }
    list.forEach(r => {
      const cfg = r.report_config || {};
      const lastRun = r.last_run_at ? new Date(r.last_run_at).toLocaleDateString() : 'Never';
      const card = document.createElement('div');
      card.className = 'saved-report-card';
      card.dataset.reportId = r.id;
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/report-id', r.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      const info = document.createElement('div');
      info.className = 'saved-report-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'saved-report-name';
      nameEl.textContent = r.name;
      const metaEl = document.createElement('div');
      metaEl.className = 'saved-report-meta';
      metaEl.textContent = (cfg.chartType || 'table') + ' \u00B7 ' + (cfg.source || 'messages') + ' \u00B7 Last run: ' + lastRun;
      info.appendChild(nameEl);
      info.appendChild(metaEl);

      const actions = document.createElement('div');
      actions.className = 'saved-report-actions';
      const openBtn = document.createElement('button');
      openBtn.className = 'btn-sm';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', (e) => { e.stopPropagation(); openSavedReport(r.id); });
      const runBtn = document.createElement('button');
      runBtn.className = 'btn-sm';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        runBtn.disabled = true;
        runBtn.textContent = 'Running...';
        try {
          const res = await window.electronAPI.runSavedReport(r.id);
          await loadSavedReports();
          if (res && res.result) {
            const config = r.report_config || {};
            openReportBuilder(config);
            renderReportResult(config, res.result);
          }
        } catch (err) {
          console.error(err);
          alert('Report run failed: ' + (err.message || 'Unknown error'));
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = 'Run';
        }
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-sm btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this report?')) return;
        try { await window.electronAPI.deleteSavedReport(r.id); loadSavedReports(); } catch (err) { console.error(err); }
      });
      actions.appendChild(openBtn);
      actions.appendChild(runBtn);
      actions.appendChild(delBtn);

      card.appendChild(info);
      card.appendChild(actions);
      container.appendChild(card);
    });
  } catch (err) {
    container.textContent = 'Could not load saved reports.';
  }
}

async function openSavedReport(reportId) {
  try {
    const report = await window.electronAPI.getSavedReport(reportId);
    currentReportId = reportId;
    const config = report.report_config || {};
    config.name = report.name;
    openReportBuilder(config);
    if (report.last_result) renderReportResult(config, report.last_result);
  } catch (err) {
    console.error('Error opening saved report:', err);
  }
}

// ==================== JOBS VIEW ====================

let jobsInitialized = false;
let editingJobId = null;

function initJobsView() {
  if (!jobsInitialized) {
    jobsInitialized = true;
    setupJobsEventListeners();
  }
  // Show unavailable message when not authenticated
  const unavailable = document.getElementById('jobsUnavailable');
  if (unavailable) unavailable.classList.toggle('hidden', !shouldShowAuthRequiredUnavailable());
  loadJobs();
}

function setupJobsEventListeners() {
  const newJobBtn = document.getElementById('jobsNewBtn');
  if (newJobBtn) newJobBtn.addEventListener('click', () => renderWorkflowBuilder(null));

  const jobFormCancel = document.getElementById('jobCancelBtn');
  if (jobFormCancel) jobFormCancel.addEventListener('click', () => loadJobs());
}

function renderWorkflowBuilder(job = null) {
  const container = document.getElementById('jobsList');
  if (!container) return;
  
  container.innerHTML = `
    <div class="workflow-builder-canvas">
      <div class="builder-step">
        <div class="step-header">
          <div class="step-number">1</div>
          <div class="step-title">Trigger & Schedule</div>
        </div>
        <div class="builder-controls">
          <div class="settings-field">
            <label>Workflow Name</label>
            <input type="text" id="builderJobName" class="settings-input" value="${job ? (job.name || '') : ''}" placeholder="e.g. Weekly Report">
          </div>
          <div class="settings-field">
            <label>Schedule</label>
            <select id="builderJobSchedule" class="settings-select">
              <option value="once" ${job?.job_type === 'one_time' ? 'selected' : ''}>Run once</option>
              <option value="hourly" ${job?.job_type === 'recurring' ? 'selected' : ''}>Every hour</option>
              <option value="daily" ${job?.job_type === 'recurring' ? 'selected' : ''}>Every day</option>
            </select>
          </div>
        </div>
      </div>

      <div class="builder-step">
        <div class="step-header">
          <div class="step-number">2</div>
          <div class="step-title">Action & Prompt</div>
        </div>
        <div class="settings-field">
          <label>What should Claude do?</label>
          <textarea id="builderJobPrompt" class="settings-textarea" rows="4" placeholder="e.g. Summarize the latest messages and send a notification...">${job?.action_config?.prompt || ''}</textarea>
        </div>
      </div>

      <div class="builder-step">
        <div class="step-header">
          <div class="step-number">3</div>
          <div class="step-title">Target & Output</div>
        </div>
        <div class="settings-field">
          <label>Output Type</label>
          <select id="builderJobAction" class="settings-select">
            <option value="chat_message" ${job?.action_type === 'chat_message' ? 'selected' : ''}>Internal Chat Message</option>
            <option value="webhook" ${job?.action_type === 'webhook' ? 'selected' : ''}>External Webhook</option>
          </select>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:12px;">
        <button class="settings-mcp-cancel-btn" onclick="loadJobs()">Cancel</button>
        <button class="settings-save-btn" id="builderSaveBtn">${job ? 'Update' : 'Create'} Workflow</button>
      </div>
    </div>
  `;

  document.getElementById('builderSaveBtn').onclick = async () => {
    const name = document.getElementById('builderJobName').value;
    const schedule = document.getElementById('builderJobSchedule').value;
    const prompt = document.getElementById('builderJobPrompt').value;
    const action = document.getElementById('builderJobAction').value;

    if (!name || !prompt) {
      showAppError('Name and Prompt are required');
      return;
    }

    try {
      const payload = {
        name,
        job_type: schedule === 'once' ? 'one_time' : 'recurring',
        action_type: action,
        action_config: { prompt },
        status: 'active'
      };

      if (job) {
        await window.electronAPI.updateJob(job.id, payload);
      } else {
        await window.electronAPI.createJob(payload);
      }
      
      showAppSuccess('Workflow saved');
      loadJobs();
    } catch (err) {
      showAppError('Failed to save workflow');
    }
  };
}

// Maps a saved job back to its friendly schedule preset value
function jobToSchedulePreset(job) {
  if (!job) return 'once';
  if (job.job_type === 'one_time') return 'once';
  if (job.job_type === 'recurring') {
    if (job.interval_seconds === 3600) return 'hourly';
    return 'custom';
  }
  if (job.job_type === 'cron') {
    if (job.cron_expression === '0 8 * * *') return 'daily';
    if (job.cron_expression === '0 8 * * 1') return 'weekly';
    if (job.cron_expression === '0 8 1 * *') return 'monthly';
    return 'custom';
  }
  return 'once';
}

// Applies the schedule preset selection to the underlying hidden type/cron/interval fields
function applySchedulePreset() {
  const preset = document.getElementById('jobSchedulePreset')?.value || 'once';
  const isCustom = preset === 'custom';
  document.getElementById('jobTypeField')?.classList.toggle('hidden', !isCustom);
  document.getElementById('jobIntervalField')?.classList.toggle('hidden', true);
  document.getElementById('jobCronField')?.classList.toggle('hidden', true);

  const typeEl = document.getElementById('jobType');
  const cronEl = document.getElementById('jobCron');
  const intervalEl = document.getElementById('jobInterval');

  switch (preset) {
    case 'once':
      document.getElementById('jobExecuteAtField')?.classList.remove('hidden');
      if (typeEl) typeEl.value = 'one_time';
      break;
    case 'hourly':
      document.getElementById('jobExecuteAtField')?.classList.add('hidden');
      if (typeEl) typeEl.value = 'recurring';
      if (intervalEl) intervalEl.value = '3600';
      break;
    case 'daily':
      document.getElementById('jobExecuteAtField')?.classList.add('hidden');
      if (typeEl) typeEl.value = 'cron';
      if (cronEl) cronEl.value = '0 8 * * *';
      break;
    case 'weekly':
      document.getElementById('jobExecuteAtField')?.classList.add('hidden');
      if (typeEl) typeEl.value = 'cron';
      if (cronEl) cronEl.value = '0 8 * * 1';
      break;
    case 'monthly':
      document.getElementById('jobExecuteAtField')?.classList.add('hidden');
      if (typeEl) typeEl.value = 'cron';
      if (cronEl) cronEl.value = '0 8 1 * *';
      break;
    case 'custom':
      document.getElementById('jobExecuteAtField')?.classList.add('hidden');
      if (typeEl) typeEl.dispatchEvent(new Event('change'));
      break;
  }
}

function openJobForm(job) {
  const form = document.getElementById('jobsForm');
  const formTitle = document.getElementById('jobsFormTitle');
  if (!form) return;
  form.classList.remove('hidden');
  editingJobId = job ? job.id : null;
  if (formTitle) formTitle.textContent = job ? 'Edit Workflow' : 'New Workflow';

  document.getElementById('jobName').value = job ? job.name : '';
  document.getElementById('jobDescription').value = job ? (job.description || '') : '';

  // Set human-friendly schedule preset first
  const preset = jobToSchedulePreset(job);
  const presetEl = document.getElementById('jobSchedulePreset');
  if (presetEl) { presetEl.value = preset; applySchedulePreset(); }

  document.getElementById('jobType').value = job ? job.job_type : 'one_time';
  document.getElementById('jobType').dispatchEvent(new Event('change'));
  document.getElementById('jobActionType').value = job ? job.action_type : 'report_generation';
  document.getElementById('jobActionType').dispatchEvent(new Event('change'));

  if (job) {
    if (job.execute_at) document.getElementById('jobExecuteAt').value = job.execute_at.slice(0, 16);
    if (job.interval_seconds) document.getElementById('jobInterval').value = job.interval_seconds;
    if (job.cron_expression) document.getElementById('jobCron').value = job.cron_expression;
    const cfg = job.action_config || {};
    if (job.action_type === 'report_generation') {
      document.getElementById('jobReportId').value = cfg.reportId || '';
    } else if (job.action_type === 'data_export') {
      const source = cfg.source || 'messages';
      const mappedSource = source === 'chats' ? 'messages' : source;
      document.getElementById('jobExportSource').value = mappedSource;
      document.getElementById('jobExportFormat').value = cfg.format || 'csv';
    } else if (job.action_type === 'webhook') {
      document.getElementById('jobWebhookUrl').value = cfg.url || '';
      document.getElementById('jobWebhookMethod').value = cfg.method || 'POST';
    } else if (job.action_type === 'chat_message') {
      document.getElementById('jobChatMessagePrompt').value = cfg.prompt || '';
      document.getElementById('jobChatMessageProvider').value = cfg.provider || cfg.providerName || 'claude';
      document.getElementById('jobChatMessageMaxTurns').value = cfg.maxTurns || '';
    } else if (job.action_type === 'run_workflow') {
      document.getElementById('jobWorkflowId').value = cfg.workflowId || '';
    }
  }
  loadSavedReportsForJobForm();
  loadSavedWorkflowsForJobForm();
}

async function loadSavedReportsForJobForm() {
  if (!useApi()) return;
  const select = document.getElementById('jobReportId');
  if (!select) return;
  try {
    const reports = await window.electronAPI.getSavedReports();
    const list = Array.isArray(reports) ? reports : (reports.data || []);
    select.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a report...';
    select.appendChild(placeholder);
    list.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  } catch (err) {
    select.textContent = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No reports available';
    select.appendChild(opt);
  }
}

async function loadSavedWorkflowsForJobForm() {
  if (!useApi()) return;
  const select = document.getElementById('jobWorkflowId');
  if (!select) return;
  try {
    const data = await window.electronAPI.getWorkflows();
    const list = Array.isArray(data) ? data : (data.workflows || data.data || []);
    select.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a workflow...';
    select.appendChild(placeholder);
    list.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = w.name || w.id;
      select.appendChild(opt);
    });
  } catch (err) {
    select.textContent = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No workflows available';
    select.appendChild(opt);
  }
}

function hideJobForm() {
  const form = document.getElementById('jobsForm');
  if (form) form.classList.add('hidden');
  editingJobId = null;
}

async function saveJob() {
  if (!useApi()) return;
  const name = document.getElementById('jobName')?.value?.trim();
  if (!name) { showAppError('Please enter a job name'); return; }

  const jobType = document.getElementById('jobType')?.value;
  const actionType = document.getElementById('jobActionType')?.value;
  const saveBtn = document.getElementById('jobSaveBtn');

  const jobData = {
    name,
    description: document.getElementById('jobDescription')?.value || '',
    job_type: jobType,
    action_type: actionType,
    action_config: {}
  };

  if (jobType === 'one_time') jobData.execute_at = document.getElementById('jobExecuteAt')?.value;
  if (jobType === 'recurring') jobData.interval_seconds = parseInt(document.getElementById('jobInterval')?.value) || 3600;
  if (jobType === 'cron') jobData.cron_expression = document.getElementById('jobCron')?.value;

  if (actionType === 'report_generation') {
    jobData.action_config = { reportId: document.getElementById('jobReportId')?.value };
  } else if (actionType === 'data_export') {
    jobData.action_config = { source: document.getElementById('jobExportSource')?.value, format: document.getElementById('jobExportFormat')?.value };
  } else if (actionType === 'webhook') {
    jobData.action_config = { url: document.getElementById('jobWebhookUrl')?.value, method: document.getElementById('jobWebhookMethod')?.value };
  } else if (actionType === 'chat_message') {
    const prompt = document.getElementById('jobChatMessagePrompt')?.value?.trim() || '';
    if (!prompt) {
      showAppError('Chat message jobs require a prompt');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Workflow';
      }
      return;
    }

    const maxTurnsValue = parseInt(document.getElementById('jobChatMessageMaxTurns')?.value, 10);
    const actionConfig = {
      prompt,
      provider: document.getElementById('jobChatMessageProvider')?.value?.trim() || 'claude'
    };

    if (Number.isInteger(maxTurnsValue) && maxTurnsValue > 0) {
      actionConfig.maxTurns = maxTurnsValue;
    }

    jobData.action_config = actionConfig;
  } else if (actionType === 'run_workflow') {
    jobData.action_config = { workflowId: document.getElementById('jobWorkflowId')?.value || '' };
  }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    if (editingJobId) {
      await window.electronAPI.updateJob(editingJobId, jobData);
    } else {
      await window.electronAPI.createJob(jobData);
    }
    hideJobForm();
    loadJobs();
    showAppSuccess(editingJobId ? 'Workflow updated.' : 'Workflow created.');
  } catch (err) {
    console.error('Save job error:', err);
    showAppError('Error saving job: ' + err.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Workflow'; }
  }
}

async function loadJobs() {
  if (!useApi()) return;
  const container = document.getElementById('jobsList');
  if (!container) return;
  try {
    const jobs = await window.electronAPI.getJobs();
    allJobs = Array.isArray(jobs) ? jobs : (jobs.jobs || jobs.data || []);
    renderWorkflowFolders();
    const list = allJobs.filter(j => !j.folder_id);
    container.textContent = '';
    if (!list.length) {
      container.textContent = 'No workflows yet. Click "New Workflow" to get started.';
      return;
    }
    list.forEach(j => {
      const statusClass = j.status === 'active' ? 'status-active' : 'status-idle';
      const nextRun = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : 'Not scheduled';

      const card = document.createElement('div');
      card.className = 'job-card';
      card.dataset.jobId = j.id;
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/job-id', j.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      const info = document.createElement('div');
      info.className = 'job-info';
      
      const name = document.createElement('div');
      name.className = 'job-name';
      name.textContent = j.name || 'Untitled Workflow';
      
      const meta = document.createElement('div');
      meta.className = 'job-meta';
      meta.textContent = `${j.job_type} \u00B7 ${j.action_type} \u00B7 Next: ${nextRun}`;
      
      info.appendChild(name);
      info.appendChild(meta);

      const status = document.createElement('div');
      status.className = `job-status ${statusClass}`;
      status.textContent = j.status;

      const actions = document.createElement('div');
      actions.className = 'job-card-actions';
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const runNowBtn = document.createElement('button');
      runNowBtn.className = 'control-btn';
      runNowBtn.title = 'Run Now';
      runNowBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      runNowBtn.onclick = async (e) => {
        e.stopPropagation();
        try { await window.electronAPI.runJob(j.id); loadJobs(); } catch (err) { console.error(err); }
      };

      const editBtn = document.createElement('button');
      editBtn.className = 'control-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
      editBtn.onclick = (e) => { e.stopPropagation(); openJobForm(j); };

      const delBtn = document.createElement('button');
      delBtn.className = 'control-btn';
      delBtn.title = 'Delete';
      delBtn.style.color = 'var(--accent-danger)';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this workflow?')) return;
        try { await window.electronAPI.deleteJob(j.id); loadJobs(); } catch (err) { console.error(err); }
      };

      actions.appendChild(runNowBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(info);
      card.appendChild(status);
      card.appendChild(actions);
      container.appendChild(card);
    });
  } catch (err) {
    container.textContent = '';
    const unavailable = document.getElementById('jobsUnavailable');
    if (unavailable) {
      const p = unavailable.querySelector('p');
      if (p) p.textContent = useApi() ? 'Could not load workflows. Check your connection.' : 'Sign in to use Workflows';
      unavailable.classList.remove('hidden');
    }
  }
}

async function toggleJobExecutions(jobId) {
  const panel = document.getElementById('jobExec_' + jobId);
  if (!panel) return;
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  panel.textContent = 'Loading...';
  try {
    const execs = await window.electronAPI.getJobExecutions(jobId, 10);
    const list = Array.isArray(execs) ? execs : (execs.data || []);
    panel.textContent = '';
    if (!list.length) { panel.textContent = 'No executions yet.'; return; }
    const table = document.createElement('table');
    table.className = 'report-data-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Status', 'Started', 'Duration', 'Error'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    list.forEach(e => {
      const tr = document.createElement('tr');
      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'job-status-badge ' + (e.status === 'success' ? 'status-active' : e.status === 'failed' ? 'status-failed' : 'status-paused');
      badge.textContent = e.status;
      tdStatus.appendChild(badge);
      const tdStarted = document.createElement('td');
      tdStarted.textContent = new Date(e.started_at).toLocaleString();
      const tdDuration = document.createElement('td');
      tdDuration.textContent = e.duration_ms ? (e.duration_ms / 1000).toFixed(1) + 's' : '-';
      const tdError = document.createElement('td');
      tdError.textContent = e.error || '-';
      tr.appendChild(tdStatus);
      tr.appendChild(tdStarted);
      tr.appendChild(tdDuration);
      tr.appendChild(tdError);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
  } catch (err) {
    panel.textContent = 'Error loading executions.';
  }
}

// ─── Artifact Panel Logic ─────────────────────────────────────────────────────

function detectArtifacts(rawContent) {
  const artifacts = [];
  const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRe.exec(rawContent)) !== null) {
    const lang = match[1] || 'text';
    const code = match[2];
    const id = 'art_' + (++artifactCounter);
    artifacts.push({ id, type: 'code', language: lang, content: code.trimEnd(), title: deriveTitle(lang, code.trimEnd()) });
  }
  if (!artifacts.length) {
    const docRe = /^(#{1,3}\s+.+)\n([\s\S]{400,})/m;
    const dm = docRe.exec(rawContent);
    if (dm) {
      const id = 'art_' + (++artifactCounter);
      artifacts.push({ id, type: 'document', language: 'markdown', content: rawContent, title: dm[1].replace(/^#+\s*/, '') });
    }
  }
  return artifacts;
}

function deriveTitle(lang, content) {
  const exts = { python: '.py', javascript: '.js', typescript: '.ts', html: '.html', css: '.css', json: '.json', bash: '.sh', shell: '.sh', sql: '.sql', rust: '.rs', go: '.go', java: '.java', ruby: '.rb', php: '.php', c: '.c', cpp: '.cpp', swift: '.swift', kotlin: '.kt', yaml: '.yaml', toml: '.toml', xml: '.xml' };
  // If content is short, derive a preview-based title
  if (content) {
    const firstLine = content.split('\n')[0].trim().slice(0, 30);
    const ext = exts[lang] || '';
    if (firstLine) return firstLine + (ext ? ' ' + ext : '');
  }
  const defaultNames = { python: 'script.py', javascript: 'script.js', typescript: 'script.ts', html: 'page.html', css: 'style.css', json: 'data.json', bash: 'script.sh', shell: 'script.sh', sql: 'query.sql', rust: 'main.rs', go: 'main.go', java: 'Main.java', ruby: 'script.rb', php: 'script.php', c: 'main.c', cpp: 'main.cpp', swift: 'main.swift', kotlin: 'Main.kt', yaml: 'config.yaml', toml: 'config.toml', xml: 'data.xml' };
  return defaultNames[lang] || lang + ' snippet';
}

function injectArtifactPill(contentDiv, artifact) {
  const codeBlocks = contentDiv.querySelectorAll('pre code');
  const wrapper = document.createElement('div');
  wrapper.className = 'artifact-pill-row';
  wrapper.style.cssText = 'display:flex;gap:6px;align-items:center;margin:6px 0';
  const pill = document.createElement('button');
  pill.className = 'artifact-pill';
  pill.textContent = 'Open in editor: ' + artifact.title;
  pill.dataset.artifactId = artifact.id;
  pill.addEventListener('click', () => openArtifactPanel(artifact.id));
  wrapper.appendChild(pill);

  // Save to Vault button
  if (window.electronAPI?.uploadVaultAsset) {
    const vaultBtn = document.createElement('button');
    vaultBtn.className = 'artifact-pill vault-save-pill';
    vaultBtn.textContent = 'Save to Vault';
    vaultBtn.addEventListener('click', async () => {
      try {
        vaultBtn.disabled = true;
        vaultBtn.textContent = 'Saving...';
        const ext = artifact.language ? (({ python: '.py', javascript: '.js', typescript: '.ts', html: '.html', css: '.css', json: '.json', bash: '.sh', shell: '.sh', sql: '.sql', rust: '.rs', go: '.go', java: '.java', ruby: '.rb', php: '.php', c: '.c', cpp: '.cpp', yaml: '.yaml', toml: '.toml', xml: '.xml' })[artifact.language] || '.txt') : '.txt';
        const filename = (artifact.title || 'snippet').replace(/[^a-zA-Z0-9._-]/g, '_') + (artifact.title.includes('.') ? '' : ext);
        const blob = new Blob([artifact.content], { type: 'text/plain' });
        const file = new File([blob], filename, { type: 'text/plain' });
        await window.electronAPI.uploadVaultAsset(file, undefined, 'ai_generated');
        vaultBtn.textContent = 'Saved!';
        setTimeout(() => { vaultBtn.textContent = 'Save to Vault'; vaultBtn.disabled = false; }, 2000);
      } catch (err) {
        console.error('[VAULT] Save artifact error:', err);
        vaultBtn.textContent = 'Save to Vault';
        vaultBtn.disabled = false;
    showAppError('Save to Vault failed: ' + err.message);
      }
    });
    wrapper.appendChild(vaultBtn);
  }

  const lastBlock = codeBlocks[codeBlocks.length - 1];
  if (lastBlock && lastBlock.closest('pre')) {
    lastBlock.closest('pre').insertAdjacentElement('afterend', wrapper);
  } else {
    contentDiv.appendChild(wrapper);
  }
}

function openArtifactPanel(id) {
  const art = artifactStore.get(id);
  if (!art) return;
  activeArtifactId = id;
  if (tabArtifact) tabArtifact.disabled = false;
  switchSidebarTab('artifact');
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('open')) sidebar.classList.add('open');
  if (artifactLangBadge) { artifactLangBadge.textContent = art.language; artifactLangBadge.style.display = ''; }
  if (artifactTitle) artifactTitle.textContent = art.title;
  updateVersionInfo();
  if (art.type === 'code') {
    if (codeEditorWrap) codeEditorWrap.style.display = '';
    if (docEditorWrap) docEditorWrap.style.display = 'none';
  } else {
    if (codeEditorWrap) codeEditorWrap.style.display = 'none';
    if (docEditorWrap) docEditorWrap.style.display = '';
  }
  refreshEditorContent();
  updateUndoRedoButtons();
}

function updateVersionInfo() {
  const art = artifactStore.get(activeArtifactId);
  if (!art || !artifactVersionInfo) return;
  artifactVersionInfo.textContent = 'v' + (art.currentVersion + 1) + ' of ' + art.versions.length;
}

function updateUndoRedoButtons() {
  const art = artifactStore.get(activeArtifactId);
  if (!art) return;
  if (artifactUndoBtn) artifactUndoBtn.disabled = art.currentVersion <= 0;
  if (artifactRedoBtn) artifactRedoBtn.disabled = art.currentVersion >= art.versions.length - 1;
}

function updateLineNumbers() {
  if (!codeEditor || !lineNumbers) return;
  const lines = codeEditor.value.split('\n').length;
  lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function pushArtifactVersion(id, newContent) {
  const art = artifactStore.get(id);
  if (!art) return;
  art.versions = art.versions.slice(0, art.currentVersion + 1);
  art.versions.push(newContent);
  art.currentVersion = art.versions.length - 1;
  updateVersionInfo();
  updateUndoRedoButtons();
}

function switchSidebarTab(tab) {
  if (tabProgress) tabProgress.classList.toggle('active', tab === 'progress');
  if (tabArtifact) tabArtifact.classList.toggle('active', tab === 'artifact');
  if (progressPanel) progressPanel.classList.toggle('active', tab === 'progress');
  if (artifactPanel) artifactPanel.classList.toggle('active', tab === 'artifact');
}

function getArtifactsForMessage(msgEl) {
  const out = [];
  artifactStore.forEach((art) => {
    if (art.messageId && msgEl.dataset?.messageId === art.messageId) {
      out.push({ id: art.id || undefined, type: art.type, language: art.language, title: art.title, versions: art.versions, currentVersion: art.currentVersion });
    }
  });
  return out.length ? out : undefined;
}

function refreshEditorContent() {
  const art = artifactStore.get(activeArtifactId);
  if (!art) return;
  const content = art.versions[art.currentVersion];
  if (art.type === 'code') {
    if (codeEditor) { codeEditor.value = content; updateLineNumbers(); }
  } else {
    if (docEditor) docEditor.innerHTML = sanitizeHtml(marked.parse(content));
  }
}

function initArtifactPanel() {
  if (tabProgress) tabProgress.addEventListener('click', () => switchSidebarTab('progress'));
  if (tabArtifact) tabArtifact.addEventListener('click', () => { if (!tabArtifact.disabled) switchSidebarTab('artifact'); });

  if (codeEditor) {
    codeEditor.addEventListener('input', () => {
      updateLineNumbers();
      if (activeArtifactId) pushArtifactVersion(activeArtifactId, codeEditor.value);
    });
    codeEditor.addEventListener('scroll', () => { if (lineNumbers) lineNumbers.scrollTop = codeEditor.scrollTop; });
    codeEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end = codeEditor.selectionEnd;
        codeEditor.value = codeEditor.value.substring(0, start) + '  ' + codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
        codeEditor.dispatchEvent(new Event('input'));
      }
    });
  }

  if (docEditor) {
    docEditor.addEventListener('input', () => { if (activeArtifactId) pushArtifactVersion(activeArtifactId, docEditor.innerHTML); });
  }

  if (docToolbar) {
    docToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
      docEditor?.focus();
    });
  }

  if (artifactCopyBtn) {
    artifactCopyBtn.addEventListener('click', () => {
      const art = artifactStore.get(activeArtifactId);
      if (!art) return;
      navigator.clipboard.writeText(art.versions[art.currentVersion]).then(() => {
        artifactCopyBtn.textContent = 'Copied!';
        setTimeout(() => { artifactCopyBtn.textContent = 'Copy'; }, 1500);
      });
    });
  }

  if (artifactDownloadBtn) {
    artifactDownloadBtn.addEventListener('click', () => {
      const art = artifactStore.get(activeArtifactId);
      if (!art) return;
      const blob = new Blob([art.versions[art.currentVersion]], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = art.title; a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (artifactUndoBtn) {
    artifactUndoBtn.addEventListener('click', () => {
      const art = artifactStore.get(activeArtifactId);
      if (!art || art.currentVersion <= 0) return;
      art.currentVersion--;
      refreshEditorContent(); updateVersionInfo(); updateUndoRedoButtons();
    });
  }
  if (artifactRedoBtn) {
    artifactRedoBtn.addEventListener('click', () => {
      const art = artifactStore.get(activeArtifactId);
      if (!art || art.currentVersion >= art.versions.length - 1) return;
      art.currentVersion++;
      refreshEditorContent(); updateVersionInfo(); updateUndoRedoButtons();
    });
  }

  initSelectionToolbar();
}

function initSelectionToolbar() {
  if (!selectionToolbar) return;
  const editorEls = [codeEditor, docEditor].filter(Boolean);
  editorEls.forEach(el => {
    el.addEventListener('mouseup', () => {
      const sel = window.getSelection();
      const text = el === codeEditor ? codeEditor.value.substring(codeEditor.selectionStart, codeEditor.selectionEnd) : sel?.toString();
      if (text && text.trim().length > 0) {
        const rect = el === codeEditor ? el.getBoundingClientRect() : sel.getRangeAt(0).getBoundingClientRect();
        selectionToolbar.style.top = (rect.top - 44) + 'px';
        selectionToolbar.style.left = rect.left + 'px';
        selectionToolbar.style.display = 'flex';
        selectionToolbar.dataset.selectedText = text;
      } else {
        selectionToolbar.style.display = 'none';
      }
    });
  });

  document.addEventListener('mousedown', (e) => {
    if (!selectionToolbar.contains(e.target) && e.target !== codeEditor && e.target !== docEditor) {
      selectionToolbar.style.display = 'none';
    }
  });

  selectionToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const selected = selectionToolbar.dataset.selectedText || '';
    const art = artifactStore.get(activeArtifactId);
    if (!art || !selected) return;
    let prompt;
    const fullContent = art.versions[art.currentVersion];
    if (action === 'ask') {
      const question = window.prompt('Ask about the selection:');
      if (!question) return;
      prompt = question + '\n\nSelected text:\n> ' + selected + '\n\nFull artifact:\n```' + art.language + '\n' + fullContent + '\n```';
    } else {
      const labels = { explain: 'Explain', improve: 'Improve', fix: 'Fix' };
      prompt = (labels[action] || action) + ' the following selection from the artifact:\n\n> ' + selected + '\n\nFull artifact:\n```' + art.language + '\n' + fullContent + '\n```';
    }
    selectionToolbar.style.display = 'none';
    if (typeof handleSendMessage === 'function') {
      messageInput.value = prompt;
      handleSendMessage(prompt);
    }
  });
}

function clearArtifacts() {
  artifactStore.clear();
  activeArtifactId = null;
  artifactCounter = 0;
  if (tabArtifact) tabArtifact.disabled = true;
  switchSidebarTab('progress');
  if (codeEditorWrap) codeEditorWrap.style.display = 'none';
  if (docEditorWrap) docEditorWrap.style.display = 'none';
}

function serializeArtifacts() {
  const out = [];
  artifactStore.forEach((art, id) => {
    out.push({ id, type: art.type, language: art.language, title: art.title, versions: art.versions, currentVersion: art.currentVersion, messageId: art.messageId });
  });
  return out;
}

function restoreArtifacts(list) {
  if (!Array.isArray(list)) return;
  clearArtifacts();
  list.forEach(art => {
    artifactStore.set(art.id, { ...art });
    const num = parseInt(art.id.replace('art_', ''), 10);
    if (num > artifactCounter) artifactCounter = num;
  });
  if (artifactStore.size > 0 && tabArtifact) tabArtifact.disabled = false;
}

// ==================== ASSETS VAULT ====================
let vaultInitialized = false;
let currentVaultFolderId = null;
let vaultViewMode = 'grid'; // 'grid' or 'list'

function initVaultView() {
  if (vaultInitialized) return;
  vaultInitialized = true;
  setupVaultEventListeners();

  const showUnavailable = shouldShowAuthRequiredUnavailable();
  if (vaultUnavailable) vaultUnavailable.classList.toggle('hidden', !showUnavailable);

  if (showUnavailable) {
    if (vaultContent) vaultContent.classList.remove('hidden');
    return;
  }

  if (vaultContent) vaultContent.classList.remove('hidden');
  loadVaultContents();
}


function setupVaultEventListeners() {
  if (vaultNewFolderBtn) vaultNewFolderBtn.addEventListener('click', promptNewFolder);
  if (vaultUploadBtn) vaultUploadBtn.addEventListener('click', () => vaultFileInput && vaultFileInput.click());
  if (vaultFileInput) vaultFileInput.addEventListener('change', handleVaultUpload);
  if (vaultSourceFilter) vaultSourceFilter.addEventListener('change', loadVaultContents);
  if (vaultSortSelect) vaultSortSelect.addEventListener('change', loadVaultContents);
  if (vaultViewToggle) vaultViewToggle.addEventListener('click', toggleVaultViewMode);
}

function toggleVaultViewMode() {
  vaultViewMode = vaultViewMode === 'grid' ? 'list' : 'grid';
  if (vaultGrid) vaultGrid.classList.toggle('list-mode', vaultViewMode === 'list');
  if (vaultViewToggle) {
    // Clear and re-add the appropriate SVG icon
    while (vaultViewToggle.firstChild) vaultViewToggle.removeChild(vaultViewToggle.firstChild);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    if (vaultViewMode === 'list') {
      // Grid icon (switch back)
      ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'].forEach(d => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        rect.setAttribute('d', d);
        svg.appendChild(rect);
      });
    } else {
      // List icon (switch to list)
      [4, 12, 20].forEach(y => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '3'); line.setAttribute('y1', String(y));
        line.setAttribute('x2', '21'); line.setAttribute('y2', String(y));
        svg.appendChild(line);
      });
    }
    vaultViewToggle.appendChild(svg);
  }
}

async function loadVaultContents() {
  if (!window.electronAPI?.getVaultFolders) return;
  try {
    const source = vaultSourceFilter ? vaultSourceFilter.value : 'all';
    const sortVal = vaultSortSelect ? vaultSortSelect.value : 'created_at:desc';
    const [sortField, sortDir] = sortVal.split(':');

    const [foldersRes, assetsRes] = await Promise.all([
      window.electronAPI.getVaultFolders(currentVaultFolderId || undefined),
      window.electronAPI.getVaultAssets({
        folderId: currentVaultFolderId || undefined,
        sort: sortField,
        dir: sortDir,
        source: source !== 'all' ? source : undefined
      })
    ]);

    const folders = Array.isArray(foldersRes) ? foldersRes : [];
    const assets = Array.isArray(assetsRes) ? assetsRes : [];

    renderVaultBreadcrumbs();
    renderVaultGrid(folders, assets);
  } catch (err) {
    console.error('[VAULT] Load error:', err);
  }
}

function renderVaultGrid(folders, assets) {
  if (!vaultGrid) return;
  vaultGrid.textContent = '';

  if (folders.length === 0 && assets.length === 0) {
    if (vaultEmpty) vaultEmpty.classList.remove('hidden');
    vaultGrid.classList.add('hidden');
    return;
  }
  if (vaultEmpty) vaultEmpty.classList.add('hidden');
  vaultGrid.classList.remove('hidden');

  // Render folders
  folders.forEach(folder => {
    const card = document.createElement('div');
    card.className = 'vault-item vault-folder';
    card.dataset.id = folder.id;

    const icon = document.createElement('div');
    icon.className = 'vault-item-icon';
    icon.textContent = '\uD83D\uDCC1'; // folder emoji
    card.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'vault-item-name';
    name.textContent = folder.name;
    card.appendChild(name);

    card.addEventListener('dblclick', () => navigateToFolder(folder.id));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showVaultContextMenu(e, 'folder', folder);
    });
    vaultGrid.appendChild(card);
  });

  // Render assets
  assets.forEach(asset => {
    const card = document.createElement('div');
    card.className = 'vault-item vault-asset';
    card.dataset.id = asset.id;

    const icon = document.createElement('div');
    icon.className = 'vault-item-icon';
    if (asset.file_type && asset.file_type.startsWith('image/')) {
      icon.textContent = '\uD83D\uDDBC\uFE0F'; // framed picture
    } else if (asset.file_type && asset.file_type.includes('pdf')) {
      icon.textContent = '\uD83D\uDCC4'; // page facing up
    } else if (asset.file_type && (asset.file_type.includes('video') || asset.file_type.includes('audio'))) {
      icon.textContent = '\uD83C\uDFAC'; // clapper board
    } else {
      icon.textContent = '\uD83D\uDCC4'; // page facing up
    }
    card.appendChild(icon);

    const nameEl = document.createElement('div');
    nameEl.className = 'vault-item-name';
    nameEl.textContent = asset.display_name || asset.file_name;
    card.appendChild(nameEl);

    const meta = document.createElement('div');
    meta.className = 'vault-item-meta';
    meta.textContent = formatVaultFileSize(asset.file_size || 0);
    card.appendChild(meta);

    card.addEventListener('dblclick', () => openAssetPreview(asset));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showVaultContextMenu(e, 'asset', asset);
    });
    vaultGrid.appendChild(card);
  });
}

async function renderVaultBreadcrumbs() {
  if (!vaultBreadcrumbs) return;
  vaultBreadcrumbs.textContent = '';

  // Root crumb
  const rootCrumb = document.createElement('span');
  rootCrumb.className = 'vault-crumb';
  rootCrumb.textContent = 'Downloads';
  rootCrumb.addEventListener('click', () => navigateToFolder(null));
  vaultBreadcrumbs.appendChild(rootCrumb);

  if (!currentVaultFolderId) return;

  if (!window.electronAPI?.getVaultBreadcrumbs) return;
  try {
    const res = await window.electronAPI.getVaultBreadcrumbs(currentVaultFolderId);
    const crumbs = Array.isArray(res) ? res : [];
    crumbs.forEach(crumb => {
      const sep = document.createElement('span');
      sep.className = 'vault-crumb-sep';
      sep.textContent = '/';
      vaultBreadcrumbs.appendChild(sep);

      const el = document.createElement('span');
      el.className = 'vault-crumb';
      el.textContent = crumb.name;
      el.addEventListener('click', () => navigateToFolder(crumb.id));
      vaultBreadcrumbs.appendChild(el);
    });
  } catch (err) {
    console.error('[VAULT] Breadcrumbs error:', err);
  }
}

function navigateToFolder(folderId) {
  currentVaultFolderId = folderId;
  loadVaultContents();
}

async function promptNewFolder() {
  const name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  if (!window.electronAPI?.createVaultFolder) return;
  try {
    await window.electronAPI.createVaultFolder(name.trim(), currentVaultFolderId || undefined);
    loadVaultContents();
  } catch (err) {
    console.error('[VAULT] Create folder error:', err);
    showAppError('Failed to create folder: ' + err.message);
  }
}

async function handleVaultUpload() {
  if (!vaultFileInput || !vaultFileInput.files.length) return;
  if (!window.electronAPI?.uploadVaultAsset) return;
  const file = vaultFileInput.files[0];
  try {
    await window.electronAPI.uploadVaultAsset(file, currentVaultFolderId || undefined, 'upload');
    vaultFileInput.value = '';
    loadVaultContents();
  } catch (err) {
    console.error('[VAULT] Upload error:', err);
    showAppError('Upload failed: ' + err.message);
  }
}

function showVaultContextMenu(e, type, item) {
  // Remove any existing context menu
  const prev = document.querySelector('.vault-context-menu');
  if (prev) prev.remove();

  const menu = document.createElement('div');
  menu.className = 'vault-context-menu';
  menu.style.position = 'fixed';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.style.zIndex = '9999';

  const actions = type === 'folder'
    ? [['Rename', 'rename'], ['Delete', 'delete']]
    : [['Open', 'open'], ['Attach to Chat', 'attach'], ['Rename', 'rename'], ['Download', 'download'], ['Delete', 'delete']];

  actions.forEach(([label, action]) => {
    const btn = document.createElement('div');
    btn.className = 'vault-context-item';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      menu.remove();
      if (type === 'folder') handleFolderAction(action, item);
      else handleAssetAction(action, item);
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Close on click elsewhere
  const close = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function handleFolderAction(action, folder) {
  if (!window.electronAPI) return;
  if (action === 'rename') {
    const name = prompt('New folder name:', folder.name);
    if (!name || !name.trim()) return;
    try {
      await window.electronAPI.updateVaultFolder(folder.id, { name: name.trim() });
      loadVaultContents();
    } catch (err) { showAppError('Rename failed: ' + err.message); }
  } else if (action === 'delete') {
    if (!confirm('Delete folder "' + folder.name + '" and all contents?')) return;
    try {
      await window.electronAPI.deleteVaultFolder(folder.id);
      loadVaultContents();
    } catch (err) { showAppError('Delete failed: ' + err.message); }
  }
}

async function handleAssetAction(action, asset) {
  if (!window.electronAPI) return;
  if (action === 'open') {
    openAssetPreview(asset);
  } else if (action === 'attach') {
    attachedFiles.push({
      id: asset.id,
      name: asset.display_name || asset.file_name,
      type: asset.file_type,
      size: asset.file_size,
      storagePath: asset.storage_path
    });
    // Switch to chat view and render the attached file
    if (isFirstMessage) {
      showView('home');
      renderAttachedFiles('home');
    } else {
      showView('chat');
      renderAttachedFiles('chat');
    }
  } else if (action === 'rename') {
    const name = prompt('New name:', asset.display_name || asset.file_name);
    if (!name || !name.trim()) return;
    try {
      await window.electronAPI.updateVaultAsset(asset.id, { display_name: name.trim() });
      loadVaultContents();
    } catch (err) { showAppError('Rename failed: ' + err.message); }
  } else if (action === 'download') {
    try {
      const res = await window.electronAPI.getVaultAssetUrl(asset.id);
      if (res.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = asset.display_name || asset.file_name;
        a.click();
      }
    } catch (err) { showAppError('Download failed: ' + err.message); }
  } else if (action === 'delete') {
    if (!confirm('Delete "' + (asset.display_name || asset.file_name) + '"?')) return;
    try {
      await window.electronAPI.deleteVaultAsset(asset.id);
      loadVaultContents();
    } catch (err) { showAppError('Delete failed: ' + err.message); }
  }
}

async function openAssetPreview(asset) {
  if (!window.electronAPI?.getVaultAssetUrl) return;
  try {
    const res = await window.electronAPI.getVaultAssetUrl(asset.id);
    if (!res.url) return;

    // Build preview overlay using DOM methods
    const overlay = document.createElement('div');
    overlay.className = 'vault-preview-overlay';

    const modal = document.createElement('div');
    modal.className = 'vault-preview-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'vault-preview-header';
    const title = document.createElement('span');
    title.textContent = asset.display_name || asset.file_name;
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close asset preview');
    closeBtn.className = 'vault-preview-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'vault-preview-body';

    if (asset.file_type && asset.file_type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = res.url;
      img.alt = asset.display_name || asset.file_name;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '70vh';
      body.appendChild(img);
    } else if (asset.file_type && asset.file_type.includes('pdf')) {
      const iframe = document.createElement('iframe');
      iframe.src = res.url;
      iframe.style.width = '100%';
      iframe.style.height = '70vh';
      iframe.style.border = 'none';
      body.appendChild(iframe);
    } else {
      const p = document.createElement('p');
      p.textContent = 'Preview not available for this file type.';
      const a = document.createElement('a');
      a.href = res.url;
      a.target = '_blank';
      a.textContent = 'Open in browser';
      body.appendChild(p);
      body.appendChild(a);
    }
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (err) {
    console.error('[VAULT] Preview error:', err);
  }
}

function formatVaultFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

// Initialize on load
window.addEventListener('load', init);
