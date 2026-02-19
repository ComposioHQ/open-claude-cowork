import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

function normalizeJobType(jobType) {
  if (jobType === 'once') return 'one_time';
  if (jobType === 'interval') return 'recurring';
  return jobType;
}

function normalizeActionType(actionType) {
  if (actionType === 'report') return 'report_generation';
  if (actionType === 'workflow') return 'run_workflow';
  return actionType;
}

function pick(payload, camelKey, snakeKey) {
  return payload[camelKey] ?? payload[snakeKey];
}

// ==================== JOBS CRUD ====================

export async function createJob(userId, jobData) {
  if (isAnonymousUserId(userId)) return null;
  const normalized = {
    jobType: normalizeJobType(pick(jobData, 'jobType', 'job_type')),
    actionType: normalizeActionType(pick(jobData, 'actionType', 'action_type')),
    actionConfig: pick(jobData, 'actionConfig', 'action_config'),
    executeAt: pick(jobData, 'executeAt', 'execute_at'),
    intervalSeconds: pick(jobData, 'intervalSeconds', 'interval_seconds'),
    cronExpression: pick(jobData, 'cronExpression', 'cron_expression'),
  };

  const { data, error } = await db()
    .from('scheduled_jobs')
    .insert({
      user_id: userId,
      name: jobData.name,
      description: jobData.description || '',
      job_type: normalized.jobType,
      status: 'active',
      execute_at: normalized.executeAt || null,
      interval_seconds: normalized.intervalSeconds || null,
      cron_expression: normalized.cronExpression || null,
      action_type: normalized.actionType,
      action_config: normalized.actionConfig || {},
      next_run_at: normalized.executeAt || null
    })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getUserJobs(userId, opts = {}) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('scheduled_jobs')
    .select('*')
    .eq('user_id', userId);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  query = query.order('created_at', { ascending: false });

  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getJob(jobId, userId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('scheduled_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateJob(jobId, userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  const normalized = {
    name: updates.name,
    description: updates.description,
    status: updates.status,
    jobType: normalizeJobType(updates.jobType ?? updates.job_type),
    executeAt: updates.executeAt ?? updates.execute_at,
    intervalSeconds: updates.intervalSeconds ?? updates.interval_seconds,
    cronExpression: updates.cronExpression ?? updates.cron_expression,
    actionType: normalizeActionType(updates.actionType ?? updates.action_type),
    actionConfig: updates.actionConfig ?? updates.action_config,
    lastRunAt: updates.lastRunAt ?? updates.last_run_at,
    nextRunAt: updates.nextRunAt ?? updates.next_run_at,
    runCount: updates.runCount ?? updates.run_count,
    lastError: updates.lastError ?? updates.last_error,
    folderId: updates.folderId ?? updates.folder_id
  };

  const payload = {};
  if (normalized.name !== undefined) payload.name = normalized.name;
  if (normalized.description !== undefined) payload.description = normalized.description;
  if (normalized.status !== undefined) payload.status = normalized.status;
  if (normalized.jobType !== undefined) payload.job_type = normalized.jobType;
  if (normalized.executeAt !== undefined) payload.execute_at = normalized.executeAt;
  if (normalized.intervalSeconds !== undefined) payload.interval_seconds = normalized.intervalSeconds;
  if (normalized.cronExpression !== undefined) payload.cron_expression = normalized.cronExpression;
  if (normalized.actionType !== undefined) payload.action_type = normalized.actionType;
  if (normalized.actionConfig !== undefined) payload.action_config = normalized.actionConfig;
  if (normalized.lastRunAt !== undefined) payload.last_run_at = normalized.lastRunAt;
  if (normalized.nextRunAt !== undefined) payload.next_run_at = normalized.nextRunAt;
  if (normalized.runCount !== undefined) payload.run_count = normalized.runCount;
  if (normalized.lastError !== undefined) payload.last_error = normalized.lastError;
  if (normalized.folderId !== undefined) payload.folder_id = normalized.folderId || null;

  const { data, error } = await db()
    .from('scheduled_jobs')
    .update(payload)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function deleteJob(jobId, userId) {
  if (isAnonymousUserId(userId)) return;
  const { error } = await db()
    .from('scheduled_jobs')
    .delete()
    .eq('id', jobId)
    .eq('user_id', userId);
  if (error) return fallbackForMissingSchema(error);
}

// ==================== JOB EXECUTIONS ====================

export async function getJobExecutions(jobId, userId, opts = {}) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('job_executions')
    .select('*')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function addJobExecution(jobId, userId, execData) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('job_executions')
    .insert({
      job_id: jobId,
      user_id: userId,
      status: execData.status || 'running',
      started_at: execData.startedAt || new Date().toISOString(),
      completed_at: execData.completedAt || null,
      duration_ms: execData.durationMs || null,
      result: execData.result || {},
      error: execData.error || null
    })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateJobExecution(executionId, updates) {
  if (!executionId) return null;
  const payload = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
  if (updates.durationMs !== undefined) payload.duration_ms = updates.durationMs;
  if (updates.result !== undefined) payload.result = updates.result;
  if (updates.error !== undefined) payload.error = updates.error;

  const { data, error } = await db()
    .from('job_executions')
    .update(payload)
    .eq('id', executionId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

// ==================== SCHEDULER HELPERS ====================

/** Get all active jobs that are due to run (next_run_at <= now). */
export async function getDueJobs() {
  const { data, error } = await db()
    .from('scheduled_jobs')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

/**
 * Atomically claim a due job before execution.
 * Uses next_run_at as a lightweight optimistic lock token so one scheduler
 * instance can claim ownership and avoid duplicate execution.
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {string} nextRunAt
 * @param {number} leaseMs
 * @returns {Promise<Object|null>} Claimed job row, or null if already taken.
 */
export async function claimDueJob(jobId, userId, nextRunAt, leaseMs = 120000) {
  if (isAnonymousUserId(userId)) return null;
  const leasedUntil = new Date(Date.now() + leaseMs).toISOString();
  const { data, error } = await db()
    .from('scheduled_jobs')
    .update({ next_run_at: leasedUntil })
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('next_run_at', nextRunAt)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') return fallbackForMissingSchema(error, null);
  return data || null;
}

/**
 * Recover jobs that appear to be stuck in leased claim state.
 * A claim replaces next_run_at with a short-lived lease timestamp; if execution
 * never resumes and the lease has passed, this method resets the schedule back
 * to "now" so the poll loop can pick it up again.
 *
 * @param {number} leaseMs
 * @returns {Promise<Object[]>} Recovered jobs.
 */
export async function recoverStaleRunningJobs(leaseMs = 120000) {
  if (leaseMs <= 0) return [];
  const cutoff = new Date(Date.now() - leaseMs).toISOString();
  const { data: staleJobs, error } = await db()
    .from('scheduled_jobs')
    .select('id, user_id, next_run_at')
    .eq('status', 'active')
    .lte('next_run_at', cutoff);

  if (error) return fallbackForMissingSchema(error, []);
  if (!staleJobs?.length) return [];

  const now = new Date().toISOString();
  const recovered = [];

  for (const job of staleJobs) {
    const { data: recoveredRows, error: updateError } = await db()
      .from('scheduled_jobs')
      .update({ next_run_at: now })
      .eq('id', job.id)
      .eq('user_id', job.user_id)
      .eq('status', 'active')
      .eq('next_run_at', job.next_run_at)
      .select('id, next_run_at')
      .single();

    if (!updateError && recoveredRows) {
      recovered.push(recoveredRows);
    }
  }

  return recovered;
}

/** Get all active jobs for scheduling on startup. */
export async function getActiveJobs() {
  const { data, error } = await db()
    .from('scheduled_jobs')
    .select('*')
    .eq('status', 'active')
    .order('next_run_at', { ascending: true });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}
