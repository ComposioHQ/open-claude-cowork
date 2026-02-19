/**
 * List integration items (Notion pages, Google Drive files) via Composio MCP
 * so the Context panel can show the user's real data instead of mock data.
 */

async function callComposioTool(composioSession, name, args = {}) {
  if (!composioSession?.mcp?.url) return null;
  const res = await fetch(composioSession.mcp.url, {
    method: 'POST',
    headers: { ...composioSession.mcp.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'tools/call', params: { name, arguments: args } })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result?.content && Array.isArray(data.result.content)) {
    const text = data.result.content.map(c => c.text).join('\n');
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }
  const raw = data.result?.content ?? data.result?.text ?? data.result;
  return typeof raw === 'object' ? raw : null;
}

/** Unwrap Composio action response: { data, successful } -> data. */
function unwrapData(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.data !== undefined && raw.successful !== false) return raw.data;
  return raw;
}

/**
 * List Google Drive files (user's real Drive via Composio).
 */
export async function listGdrive(composioSession) {
  const out = await callComposioTool(composioSession, 'GOOGLEDRIVE_FIND_FILE', {
    pageSize: 30,
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name)'
  });
  const raw = unwrapData(out) ?? out;
  if (!raw || typeof raw !== 'object') return [];
  const files = raw.files ?? raw.data?.files ?? (Array.isArray(raw) ? raw : []);
  return files
    .filter(f => f && (f.id || f.file_id))
    .map(f => ({ id: f.id ?? f.file_id, title: f.name ?? f.title ?? 'Untitled' }));
}

/**
 * List Notion pages/databases (user's real Notion via Composio).
 */
export async function listNotion(composioSession) {
  const out = await callComposioTool(composioSession, 'NOTION_FETCH_DATA', {});
  const raw = unwrapData(out) ?? out;
  if (!raw || typeof raw !== 'object') return [];
  const results = raw.results ?? raw.data?.results ?? (Array.isArray(raw) ? raw : []);
  return results
    .filter(r => r && (r.id || r.page_id))
    .map(r => {
      const id = r.id ?? r.page_id;
      let title = r.title ?? r.name;
      if (title && typeof title === 'object' && title.title) {
        const arr = title.title;
        title = Array.isArray(arr) && arr[0]?.plain_text ? arr[0].plain_text : String(title);
      }
      return { id, title: title ?? 'Untitled' };
    });
}

/**
 * List ClickUp lists (user's real ClickUp via Composio) if a list action exists.
 */
export async function listClickup(composioSession) {
  const out = await callComposioTool(composioSession, 'CLICKUP_GET_LIST', {}).catch(() => null);
  const raw = unwrapData(out) ?? out;
  if (!raw || typeof raw !== 'object') return [];
  const lists = raw.lists ?? raw.data?.lists ?? (Array.isArray(raw) ? raw : []);
  return lists
    .filter(l => l && (l.id || l.list_id))
    .map(l => ({ id: l.id ?? l.list_id, title: l.name ?? l.title ?? 'Untitled' }));
}

/**
 * @param {object} composioSession - Composio MCP session
 * @param {'notion'|'gdrive'|'clickup'} type
 * @returns {Promise<Array<{id: string, title: string}>>}
 */
export async function listIntegrationItems(composioSession, type) {
  if (!composioSession) return [];
  switch (type) {
    case 'gdrive':
      return listGdrive(composioSession);
    case 'notion':
      return listNotion(composioSession);
    case 'clickup':
      return listClickup(composioSession);
    default:
      return [];
  }
}
