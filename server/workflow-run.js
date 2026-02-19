import * as workflowStore from './supabase/workflow-store.js';
import { getProvider } from './providers/index.js';
import { readUserSettingsFile } from './utils/settings-utils.js';

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill', 'Task', 'TaskOutput'];

/**
 * Run a workflow: create execution record, run provider with blueprint system prompt, update execution.
 * @param {Object} workflow - Workflow row from DB (id, blueprint_json, context_refs_json, etc.)
 * @param {string} userId - User id
 * @param {Object} options - { mcpServers, systemPromptAppend, providerName, model, allowedTools }
 * @returns {Promise<{ executionId: string, status: string, durationMs?: number, error?: string }>}
 */
export async function runWorkflow(workflow, userId, options = {}) {
  const providerName = options.providerName || options.provider || 'claude';
  const model = options.model || null;
  const mcpServers = options.mcpServers || {};
  const systemPromptAppend = options.systemPromptAppend || '';
  const allowedTools = options.allowedTools || DEFAULT_ALLOWED_TOOLS;

  const startedAt = new Date();
  let execution;

  try {
    execution = await workflowStore.addWorkflowExecution(workflow.id, userId, { status: 'running', startedAt: startedAt.toISOString() });
  } catch (err) {
    console.error('[WORKFLOW-RUN] Failed to create execution:', err.message);
    throw err;
  }

  const provider = getProvider(providerName);
  const chatId = `workflow:${workflow.id}`;
  const permissions = readUserSettingsFile().permissions || { mode: 'bypassPermissions', allowedDirectories: [], fileDeleteConfirmation: true };

  let responseText = '';
  let runError = null;

  try {
    for await (const chunk of provider.query({
      prompt: 'Execute the workflow blueprint. Follow the steps and use the tools indicated in the system prompt.',
      chatId,
      userId,
      mcpServers,
      model,
      allowedTools,
      maxTurns: 50,
      systemPromptAppend: systemPromptAppend || undefined,
      permissionMode: permissions.mode || 'bypassPermissions',
      allowedDirectories: permissions.allowedDirectories || []
    })) {
      if (chunk?.type === 'text' && chunk.content) {
        responseText += chunk.content;
      }
      if (chunk?.type === 'error' && chunk.message) {
        runError = chunk.message;
      }
    }
  } catch (err) {
    runError = err.message || String(err);
    console.error('[WORKFLOW-RUN] Provider error:', runError);
  }

  const completedAt = new Date();
  const durationMs = completedAt - startedAt;
  const status = runError ? 'failed' : 'success';

  await workflowStore.updateWorkflowExecution(execution.id, {
    status,
    completedAt: completedAt.toISOString(),
    durationMs,
    resultJson: { responseLength: responseText.length, summary: responseText.slice(0, 500) },
    error: runError || null
  });

  return {
    executionId: execution.id,
    status,
    durationMs,
    error: runError || undefined
  };
}
