import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

// ==================== WORKFLOWS CRUD ====================

export async function createWorkflow(userId, workflowData) {
  if (isAnonymousUserId(userId)) return null;
  const payload = {
    user_id: userId,
    name: workflowData.name || 'Untitled workflow',
    description: workflowData.description ?? '',
    source_chat_id: workflowData.sourceChatId ?? workflowData.source_chat_id ?? null,
    blueprint_json: workflowData.blueprintJson ?? workflowData.blueprint_json ?? {},
    context_refs_json: workflowData.contextRefsJson ?? workflowData.context_refs_json ?? {},
    status: 'active'
  };

  const { data, error } = await db()
    .from('workflows')
    .insert(payload)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getUserWorkflows(userId, opts = {}) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (opts.status) {
    query = query.eq('status', opts.status);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getWorkflow(workflowId, userId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('user_id', userId)
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getWorkflowForRun(workflowId, userId) {
  const w = await getWorkflow(workflowId, userId);
  return w;
}

export async function updateWorkflow(workflowId, userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.sourceChatId !== undefined) payload.source_chat_id = updates.sourceChatId;
  if (updates.source_chat_id !== undefined) payload.source_chat_id = updates.source_chat_id;
  if (updates.blueprintJson !== undefined) payload.blueprint_json = updates.blueprintJson;
  if (updates.blueprint_json !== undefined) payload.blueprint_json = updates.blueprint_json;
  if (updates.contextRefsJson !== undefined) payload.context_refs_json = updates.contextRefsJson;
  if (updates.context_refs_json !== undefined) payload.context_refs_json = updates.context_refs_json;
  if (updates.status !== undefined) payload.status = updates.status;

  if (!Object.keys(payload).length) return getWorkflow(workflowId, userId);

  const { data, error } = await db()
    .from('workflows')
    .update(payload)
    .eq('id', workflowId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function deleteWorkflow(workflowId, userId) {
  if (isAnonymousUserId(userId)) return;
  const { error } = await db()
    .from('workflows')
    .delete()
    .eq('id', workflowId)
    .eq('user_id', userId);
  if (error) return fallbackForMissingSchema(error);
}

// ==================== WORKFLOW EXECUTIONS ====================

export async function addWorkflowExecution(workflowId, userId, execData = {}) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: execData.status || 'running',
      started_at: execData.startedAt || new Date().toISOString(),
      completed_at: execData.completedAt || null,
      duration_ms: execData.durationMs || null,
      result_json: execData.resultJson ?? execData.result_json ?? {},
      error: execData.error || null
    })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateWorkflowExecution(executionId, updates) {
  if (!executionId) return null;
  const payload = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
  if (updates.durationMs !== undefined) payload.duration_ms = updates.durationMs;
  if (updates.resultJson !== undefined) payload.result_json = updates.resultJson;
  if (updates.result_json !== undefined) payload.result_json = updates.result_json;
  if (updates.error !== undefined) payload.error = updates.error;

  const { data, error } = await db()
    .from('workflow_executions')
    .update(payload)
    .eq('id', executionId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getWorkflowExecutions(workflowId, userId, opts = {}) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('workflow_executions')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}
