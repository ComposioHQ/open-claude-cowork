import { readUserSettingsFile } from './settings-utils.js';

/**
 * Build a system prompt appendix from global + folder instructions, project info, and external context.
 */
export function buildSystemPrompt(chatMetadata = {}) {
  const data = readUserSettingsFile();
  const instructions = data.instructions || { global: '', folders: [] };
  const parts = [];

  // Project Context
  const project = chatMetadata.project || {};
  if (project.name || project.desc) {
    parts.push(`## Project Context\nName: ${project.name || 'Untitled'}\nGoal: ${project.desc || 'Not specified'}`);
  }

  // Snapshot instructions (e.g. from workflow context refs or chat metadata)
  if (chatMetadata.instructions && String(chatMetadata.instructions).trim()) {
    parts.push('## Project Instructions\n' + String(chatMetadata.instructions).trim());
  }

  if (instructions.global && instructions.global.trim()) {
    parts.push('## User Instructions\n' + instructions.global.trim());
  }

  if (Array.isArray(instructions.folders)) {
    for (const folder of instructions.folders) {
      if (folder.path && folder.instructions && folder.instructions.trim()) {
        parts.push(`### Instructions for ${folder.path}\n${folder.instructions.trim()}`);
      }
    }
  }

  // External context (if fetched)
  if (chatMetadata.externalContent) {
    parts.push(chatMetadata.externalContent);
  }

  return parts.join('\n\n');
}

/**
 * Fetch direct content from external pinned resources (Notion, GDrive, YouTube).
 * Uses the Composio MCP session to call tools programmatically.
 */
export async function fetchDirectExternalContext(metadata, composioSession) {
  if (!composioSession?.mcp?.url) return '';
  const integrations = metadata?.integrations || {};
  const parts = [];

  const callTool = async (name, args) => {
    try {
      const res = await fetch(composioSession.mcp.url, {
        method: 'POST',
        headers: { ...composioSession.mcp.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/call', params: { name, arguments: args } })
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Extract content from MCP response format
      if (data.result && data.result.content && Array.isArray(data.result.content)) {
        return data.result.content.map(c => c.text).join('\n');
      }
      return data.result?.content || data.result?.text || JSON.stringify(data.result);
    } catch (err) {
      console.warn(`[CONTEXT] MCP tool call failed (${name}):`, err.message);
      return null;
    }
  };

  // Notion
  if (Array.isArray(integrations.notion) && integrations.notion.length > 0) {
    for (const item of integrations.notion) {
      const content = await callTool('NOTION_GET_PAGE_CONTENT', { page_id: item.id });
      if (content) parts.push(`### Pinned Notion Page: ${item.title}\n${content}`);
    }
  }

  // Google Drive
  if (Array.isArray(integrations.gdrive) && integrations.gdrive.length > 0) {
    for (const item of integrations.gdrive) {
      const content = await callTool('GOOGLEDRIVE_GET_FILE_CONTENT', { file_id: item.id });
      if (content) parts.push(`### Pinned Google Drive File: ${item.title}\n${content}`);
    }
  }

  // YouTube (Transcript)
  if (Array.isArray(integrations.youtube) && integrations.youtube.length > 0) {
    for (const item of integrations.youtube) {
      const content = await callTool('YOUTUBE_GET_TRANSCRIPT', { video_url: item.id });
      if (content) parts.push(`### Pinned YouTube Transcript: ${item.title}\n${content}`);
    }
  }

  return parts.length > 0 ? '## Pinned External Resources\n' + parts.join('\n\n') : '';
}

const WEB_SOURCE_TIMEOUT_MS = 15_000;
const WEB_SOURCE_MAX_CHARS_PER_URL = 80_000;
const WEB_SOURCE_MAX_TOTAL_CHARS = 200_000;

/**
 * Fetch content from web source URLs (fresh each run). Used for workflow context replay.
 */
export async function fetchWebSourcesContext(webSources = []) {
  if (!Array.isArray(webSources) || webSources.length === 0) return '';
  const parts = [];
  let totalChars = 0;
  for (const url of webSources) {
    if (totalChars >= WEB_SOURCE_MAX_TOTAL_CHARS) break;
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || !/^https?:\/\//i.test(u)) continue;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEB_SOURCE_TIMEOUT_MS);
      const res = await fetch(u, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OpenClaudeCowork/1.0 (Workflow context)' }
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      let text = await res.text();
      if (text.length > WEB_SOURCE_MAX_CHARS_PER_URL) {
        text = text.slice(0, WEB_SOURCE_MAX_CHARS_PER_URL) + '\n[... truncated]';
      }
      const safe = text.replace(/\s+/g, ' ').trim();
      if (safe.length > 0) {
        parts.push(`### Web: ${u}\n${safe}`);
        totalChars += safe.length;
      }
    } catch (err) {
      console.warn('[CONTEXT] Web source fetch failed:', u, err.message);
    }
  }
  return parts.length > 0 ? '## Web Sources (fetched this run)\n' + parts.join('\n\n') : '';
}

/**
 * Build system prompt for workflow run: resolve context refs (URLs + integrations)
 * and append workflow blueprint.
 */
export async function buildWorkflowSystemPrompt(workflow, composioSession) {
  const metadata = { ...(workflow.context_refs_json || {}) };
  const [externalContent, webContent] = await Promise.all([
    fetchDirectExternalContext(metadata, composioSession),
    fetchWebSourcesContext(metadata.webSources || [])
  ]);
  const combined = [externalContent, webContent].filter(Boolean).join('\n\n');
  if (combined) metadata.externalContent = combined;
  let prompt = buildSystemPrompt(metadata);
  const blueprint = workflow.blueprint_json || {};
  const steps = blueprint.todos || [];
  const toolCalls = blueprint.toolCalls || [];
  const blueprintText = [
    '## Workflow Blueprint',
    'Execute the following steps and tool sequence. Use the same tools and order where applicable.',
    steps.length ? '### Steps\n' + steps.map((s, i) => `${i + 1}. ${s.content || s.activeForm || '(step)'}`).join('\n') : '',
    toolCalls.length ? '### Tool sequence\n' + toolCalls.map(t => `- ${t.name}`).join('\n') : ''
  ].filter(Boolean).join('\n\n');
  return prompt ? prompt + '\n\n' + blueprintText : blueprintText;
}
