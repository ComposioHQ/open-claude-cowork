/**
 * Database Explorer — Read-only Supabase viewer.
 * IIFE that attaches to window.dbExplorer for use by renderer.js.
 *
 * Note: All dynamic content is passed through escapeHtml() before insertion
 * to prevent XSS. The data comes from our own backend admin-only endpoints.
 */
(function () {
  'use strict';

  // State
  let tables = [];
  let selectedTable = null;
  let currentTab = 'data';
  let currentColumns = [];
  let currentIndexes = [];
  let currentPage = 0;
  let currentPageSize = 25;
  let currentSort = null;
  let currentSortDir = 'ASC';
  let currentSearch = '';
  let totalRows = 0;
  let searchDebounceTimer = null;
  let loaded = false;

  // DOM refs (resolved lazily)
  function $(id) { return document.getElementById(id); }

  // ===================== PUBLIC API =====================
  window.dbExplorer = {
    load: async function () {
      if (loaded) return;
      loaded = true;
      setupListeners();
      try {
        await Promise.all([loadStats(), loadTables()]);
      } catch (err) {
        console.error('[DB-EXPLORER] Load error:', err);
        loaded = false;
      }
    }
  };

  // ===================== DATA LOADING =====================
  async function loadStats() {
    try {
      const stats = await window.electronAPI.getDatabaseStats();
      $('dbStatTables').textContent = stats.table_count ?? '-';
      $('dbStatSize').textContent = stats.total_size ?? '-';
      $('dbStatIndexes').textContent = stats.index_count ?? '-';

      // Parse pg version — extract major.minor
      var versionMatch = stats.pg_version ? stats.pg_version.match(/PostgreSQL ([\d.]+)/) : null;
      $('dbStatVersion').textContent = versionMatch ? versionMatch[1] : (stats.pg_version || '-');

      // Extensions badges
      var extContainer = $('dbExtensions');
      extContainer.textContent = '';
      if (stats.extensions && stats.extensions.length) {
        stats.extensions.forEach(function (ext) {
          var badge = document.createElement('span');
          badge.className = 'db-ext-badge';
          if (ext === 'vector' || ext === 'pg_cron') badge.className += ' highlight';
          badge.textContent = ext;
          extContainer.appendChild(badge);
        });
      }
    } catch (err) {
      console.error('[DB-EXPLORER] Stats error:', err);
    }
  }

  async function loadTables() {
    var list = $('dbTableList');
    list.textContent = '';
    appendLoading(list, 'Loading tables...');
    try {
      var result = await window.electronAPI.getDatabaseTables();
      tables = result.tables || [];
      renderTableList();
    } catch (err) {
      list.textContent = '';
      appendError(
        list,
        'Failed to load tables: ' + err.message,
        function () {
          loadTables();
        }
      );
    }
  }

  async function selectTable(tableName) {
    selectedTable = tableName;
    currentPage = 0;
    currentSort = null;
    currentSortDir = 'ASC';
    currentSearch = '';
    currentTab = 'data';

    // Update UI
    renderTableList();
    $('dbTabs').classList.remove('hidden');
    var placeholder = $('dbDetailPanel').querySelector('.db-detail-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // Show data tab, clear search
    var searchInput = $('dbSearchInput');
    if (searchInput) searchInput.value = '';

    switchTab('data');

    // Load schema + rows in parallel
    try {
      var results = await Promise.all([
        window.electronAPI.getDatabaseTableSchema(tableName),
        window.electronAPI.getDatabaseTableRows(tableName, { page: 0, pageSize: currentPageSize })
      ]);
      var schema = results[0];
      var rowsResult = results[1];
      currentColumns = schema.columns || [];
      currentIndexes = schema.indexes || [];
      totalRows = rowsResult.total_count || 0;

      renderDataTable(rowsResult.rows || [], currentColumns);
      renderPagination();
      renderSchema(currentColumns);
      renderIndexes(currentIndexes);
    } catch (err) {
      appendDataError(
        $('dbDataTbody'),
        99,
        'Error loading data: ' + err.message,
        function () {
          selectTable(selectedTable);
        }
      );
    }
  }

  async function loadRows() {
    try {
      var params = {
        page: currentPage,
        pageSize: currentPageSize
      };
      if (currentSort) {
        params.sort = currentSort;
        params.dir = currentSortDir;
      }
      if (currentSearch) {
        params.search = currentSearch;
      }
      var result = await window.electronAPI.getDatabaseTableRows(selectedTable, params);
      totalRows = result.total_count || 0;
      renderDataTable(result.rows || [], currentColumns);
      renderPagination();
    } catch (err) {
      appendDataError(
        $('dbDataTbody'),
        Math.max(currentColumns.length, 1),
        'Error loading rows: ' + err.message,
        function () {
          loadRows();
        }
      );
    }
  }

  // ===================== RENDERING =====================
  function renderTableList() {
    var list = $('dbTableList');
    list.textContent = '';
    if (!tables.length) {
      appendLoading(list, 'No tables found');
      return;
    }
    tables.forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'db-table-item' + (t.table_name === selectedTable ? ' active' : '');
      item.dataset.table = t.table_name;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'db-table-item-name';
      nameSpan.textContent = t.table_name;
      item.appendChild(nameSpan);

      var metaSpan = document.createElement('span');
      metaSpan.className = 'db-table-item-meta';
      metaSpan.textContent = (t.row_estimate || 0) + ' rows \u00B7 ' + (t.total_size || '0 bytes');
      item.appendChild(metaSpan);

      list.appendChild(item);
    });
  }

  function renderDataTable(rows, columns) {
    var thead = $('dbDataThead');
    var tbody = $('dbDataTbody');

    // Header
    thead.textContent = '';
    var headerRow = document.createElement('tr');
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.dataset.column = col.column_name;
      var isSorted = currentSort === col.column_name;
      if (isSorted) th.className = 'sorted';
      th.textContent = col.column_name;

      var arrow = document.createElement('span');
      arrow.className = 'sort-indicator';
      arrow.textContent = isSorted ? (currentSortDir === 'ASC' ? ' \u25B2' : ' \u25BC') : ' \u25B2';
      th.appendChild(arrow);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Body
    tbody.textContent = '';
    if (!rows.length) {
      var emptyRow = document.createElement('tr');
      var emptyTd = document.createElement('td');
      emptyTd.setAttribute('colspan', String(columns.length || 1));
      emptyTd.style.cssText = 'text-align:center;color:var(--text-tertiary);padding:20px;';
      emptyTd.textContent = 'No rows';
      emptyRow.appendChild(emptyTd);
      tbody.appendChild(emptyRow);
      return;
    }

    var vectorCols = {};
    columns.forEach(function (c) {
      if (c.data_type && c.data_type.toLowerCase().indexOf('vector') !== -1) {
        vectorCols[c.column_name] = true;
      }
    });

    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      columns.forEach(function (col) {
        var td = document.createElement('td');
        var val = row[col.column_name];
        if (val === null || val === undefined) {
          td.className = 'null-value';
          td.textContent = 'NULL';
        } else if (vectorCols[col.column_name]) {
          td.className = 'vector-value';
          td.title = String(val);
          td.textContent = String(val);
        } else {
          var str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          td.title = str;
          td.textContent = str;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderPagination() {
    var totalPages = Math.ceil(totalRows / currentPageSize) || 1;
    var pageNum = currentPage + 1;
    $('dbPageInfo').textContent = 'Page ' + pageNum + ' of ' + totalPages + ' (' + totalRows + ' rows)';
    $('dbPrevPage').disabled = currentPage <= 0;
    $('dbNextPage').disabled = pageNum >= totalPages;
  }

  function renderSchema(columns) {
    var tbody = $('dbSchemaTbody');
    tbody.textContent = '';
    columns.forEach(function (col) {
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      var strong = document.createElement('strong');
      strong.textContent = col.column_name;
      tdName.appendChild(strong);
      tr.appendChild(tdName);

      var tdType = document.createElement('td');
      var typeSpan = document.createElement('span');
      typeSpan.className = 'db-type-label';
      typeSpan.textContent = col.data_type;
      tdType.appendChild(typeSpan);
      tr.appendChild(tdType);

      var tdNull = document.createElement('td');
      tdNull.textContent = col.is_nullable ? 'Yes' : 'No';
      tr.appendChild(tdNull);

      var tdDefault = document.createElement('td');
      if (col.column_default) {
        var code = document.createElement('code');
        code.textContent = col.column_default;
        tdDefault.appendChild(code);
      } else {
        tdDefault.textContent = '-';
      }
      tr.appendChild(tdDefault);

      var tdConstraints = document.createElement('td');
      if (col.is_primary_key) {
        var badge = document.createElement('span');
        badge.className = 'db-pk-badge';
        badge.textContent = 'PK';
        tdConstraints.appendChild(badge);
      } else {
        tdConstraints.textContent = '-';
      }
      tr.appendChild(tdConstraints);

      tbody.appendChild(tr);
    });
  }

  function renderIndexes(indexes) {
    var tbody = $('dbIndexesTbody');
    tbody.textContent = '';
    if (!indexes.length) {
      var emptyRow = document.createElement('tr');
      var emptyTd = document.createElement('td');
      emptyTd.setAttribute('colspan', '5');
      emptyTd.style.cssText = 'text-align:center;color:var(--text-tertiary);padding:20px;';
      emptyTd.textContent = 'No indexes';
      emptyRow.appendChild(emptyTd);
      tbody.appendChild(emptyRow);
      return;
    }
    indexes.forEach(function (idx) {
      var isHnsw = idx.index_definition && idx.index_definition.toLowerCase().indexOf('hnsw') !== -1;
      var tr = document.createElement('tr');
      if (isHnsw) tr.className = 'db-index-hnsw';

      var tdName = document.createElement('td');
      tdName.textContent = idx.index_name;
      tr.appendChild(tdName);

      var tdDef = document.createElement('td');
      tdDef.className = 'index-def';
      tdDef.title = idx.index_definition;
      tdDef.textContent = idx.index_definition;
      tr.appendChild(tdDef);

      var tdUnique = document.createElement('td');
      tdUnique.textContent = idx.is_unique ? 'Yes' : 'No';
      tr.appendChild(tdUnique);

      var tdSize = document.createElement('td');
      tdSize.textContent = idx.index_size || '-';
      tr.appendChild(tdSize);

      var tdScan = document.createElement('td');
      tdScan.textContent = idx.idx_scan != null ? idx.idx_scan : '-';
      tr.appendChild(tdScan);

      tbody.appendChild(tr);
    });
  }

  // ===================== TAB SWITCHING =====================
  function switchTab(tabName) {
    currentTab = tabName;
    // Update tab buttons
    var tabs = $('dbTabs');
    if (tabs) {
      var btns = tabs.querySelectorAll('.db-tab');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.tab === tabName);
      }
    }
    // Show/hide content
    $('dbDataTab').classList.toggle('hidden', tabName !== 'data');
    $('dbSchemaTab').classList.toggle('hidden', tabName !== 'schema');
    $('dbIndexesTab').classList.toggle('hidden', tabName !== 'indexes');
  }

  // ===================== EVENT LISTENERS =====================
  function setupListeners() {
    // Table list clicks (event delegation)
    $('dbTableList').addEventListener('click', function (e) {
      var item = e.target.closest('.db-table-item');
      if (item && item.dataset.table) {
        selectTable(item.dataset.table);
      }
    });

    // Tab clicks
    var tabs = $('dbTabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.db-tab');
        if (tab && tab.dataset.tab) {
          switchTab(tab.dataset.tab);
        }
      });
    }

    // Column header sort clicks (event delegation)
    $('dbDataThead').addEventListener('click', function (e) {
      var th = e.target.closest('th');
      if (th && th.dataset.column) {
        var col = th.dataset.column;
        if (currentSort === col) {
          currentSortDir = currentSortDir === 'ASC' ? 'DESC' : 'ASC';
        } else {
          currentSort = col;
          currentSortDir = 'ASC';
        }
        currentPage = 0;
        loadRows();
      }
    });

    // Search input with debounce
    $('dbSearchInput').addEventListener('input', function (e) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function () {
        currentSearch = e.target.value.trim();
        currentPage = 0;
        if (selectedTable) loadRows();
      }, 400);
    });

    // Page size
    $('dbPageSize').addEventListener('change', function (e) {
      currentPageSize = Number(e.target.value) || 25;
      currentPage = 0;
      if (selectedTable) loadRows();
    });

    // Prev/Next
    $('dbPrevPage').addEventListener('click', function () {
      if (currentPage > 0) {
        currentPage--;
        loadRows();
      }
    });
    $('dbNextPage').addEventListener('click', function () {
      var totalPages = Math.ceil(totalRows / currentPageSize) || 1;
      if (currentPage + 1 < totalPages) {
        currentPage++;
        loadRows();
      }
    });
  }

  // ===================== UTILITIES =====================
  function appendLoading(parent, message) {
    var div = document.createElement('div');
    div.className = 'db-loading';
    div.textContent = message;
    parent.appendChild(div);
  }

  function appendError(parent, message, retryAction) {
    var div = document.createElement('div');
    div.className = 'db-error';

    var messageText = document.createElement('div');
    messageText.className = 'db-error-message';
    messageText.textContent = message;
    div.appendChild(messageText);

    if (typeof retryAction === 'function') {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'db-error-retry';
      button.textContent = 'Retry';
      button.addEventListener('click', function () {
        retryAction();
      });
      div.appendChild(button);
    }

    parent.appendChild(div);
  }

  function appendDataError(parent, colspan, message, retryAction) {
    parent.textContent = '';
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.setAttribute('colspan', String(colspan || 1));
    td.className = 'db-error-cell';

    var messageText = document.createElement('div');
    messageText.className = 'db-error-message';
    messageText.textContent = message;
    td.appendChild(messageText);

    if (typeof retryAction === 'function') {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'db-error-retry';
      button.textContent = 'Retry';
      button.addEventListener('click', function () {
        retryAction();
      });
      td.appendChild(button);
    }

    tr.appendChild(td);
    parent.appendChild(tr);
  }
})();
