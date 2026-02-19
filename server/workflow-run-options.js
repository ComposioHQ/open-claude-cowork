import * as sessionStore from './composio-session-store.js';
import { buildWorkflowSystemPrompt } from './utils/prompt-utils.js';

/**
 * Build options for running a workflow (mcpServers, systemPromptAppend, allowedTools).
 * Used by both the API handler and the job scheduler.
 */
export async function getWorkflowRunOptions(workflow, userId) {
  let session = sessionStore.getSession(userId);
  if (!session && sessionStore.createSession) {
    session = await sessionStore.createSession(userId);
  }
  const mcpServers = sessionStore.buildMcp(session);
  const systemPromptAppend = await buildWorkflowSystemPrompt(workflow, session);
  const allowedTools = sessionStore.getAllowedTools();
  return { mcpServers, systemPromptAppend, allowedTools };
}
