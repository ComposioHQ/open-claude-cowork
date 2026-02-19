/**
 * Shared store for Composio session and MCP builder so job-scheduler can run workflows
 * without importing server.js. Server must call register() at startup.
 */
let getSessionFn = () => null;
let buildMcpFn = () => ({});
let createSessionFn = async () => null;
let getAllowedToolsFn = () => ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill', 'Task', 'TaskOutput'];

export function register(handlers) {
  if (handlers.getSession) getSessionFn = handlers.getSession;
  if (handlers.buildMcp) buildMcpFn = handlers.buildMcp;
  if (handlers.createSession) createSessionFn = handlers.createSession;
  if (handlers.getAllowedTools) getAllowedToolsFn = handlers.getAllowedTools;
}

export function getSession(userId) {
  return getSessionFn(userId);
}

export function buildMcp(session) {
  return buildMcpFn(session);
}

export async function createSession(userId) {
  return createSessionFn(userId);
}

export function getAllowedTools() {
  return getAllowedToolsFn();
}
