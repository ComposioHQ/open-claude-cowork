import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import * as jobStore from './supabase/job-store.js';
import * as reportStore from './supabase/report-store.js';
import * as workflowStore from './supabase/workflow-store.js';
import { getProvider } from './providers/index.js';
import { getWorkflowRunOptions } from './workflow-run-options.js';
import { runWorkflow } from './workflow-run.js';

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const MAX_DAILY_CRON_LOOKAHEAD_MINUTES = 60 * 24 * 365;
const CLAIM_LEASE_MS = Math.max(POLL_INTERVAL_MS * 2, Number(process.env.JOB_CLAIM_LEASE_MS || 120_000));
const ALLOWED_EXPORT_FORMATS = new Set(['json', 'csv']);

let pollTimer = null;

const MONTH_ALIASES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const DOW_ALIASES = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

function toCronNumber(value, min, max, aliases = {}) {
  const normalized = String(value).trim().toLowerCase();
  const aliased = aliases[normalized];
  const parsed = Number(aliased ?? normalized);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseCronFieldValuesFromSegment(segment, spec) {
  const token = String(segment || '').trim().toLowerCase();
  if (token === '*' || token === '?') return { any: true, values: null };

  const stepSplit = token.split('/');
  if (stepSplit.length > 2) return null;
  const base = stepSplit[0];
  const stepRaw = stepSplit[1];
  const step = stepRaw ? Number(stepRaw) : 1;
  if (stepRaw && (!Number.isInteger(step) || step <= 0)) return null;

  let rangeStart = spec.min;
  let rangeEnd = spec.max;

  if (base !== '*') {
    if (base.includes('-')) {
      const [startRaw, endRaw] = base.split('-').map((p) => p.trim());
      const start = toCronNumber(startRaw, spec.min, spec.max, spec.aliases);
      const end = toCronNumber(endRaw, spec.min, spec.max, spec.aliases);
      if (start === null || end === null) return null;
      if (start <= end) {
        rangeStart = start;
        rangeEnd = end;
      } else {
        // Wrap ranges are not supported by this parser.
        return null;
      }
    } else {
      const single = toCronNumber(base, spec.min, spec.max, spec.aliases);
      if (single === null) return null;
      rangeStart = single;
      rangeEnd = single;
    }
  }

  const values = new Set();
  for (let value = rangeStart; value <= rangeEnd; value += step) {
    values.add(value);
  }

  if (values.size === 0) return null;
  return { any: false, values };
}

function parseCronField(field, spec) {
  const tokens = String(field || '*').trim().toLowerCase().split(',');
  const values = new Set();
  let isAny = false;

  for (let token of tokens) {
    token = token.trim();
    if (!token) {
      return null;
    }

    if (token === '*' || token === '?') {
      isAny = true;
      break;
    }

    const valuesFromToken = parseCronFieldValuesFromSegment(token, spec);
    if (!valuesFromToken) return null;

    if (valuesFromToken.any) {
      isAny = true;
      break;
    }

    for (const value of valuesFromToken.values) {
      values.add(value);
    }
  }

  if (isAny) return { any: true, values: null };
  if (values.size === 0) return null;
  return { any: false, values };
}

function getDaysInMonth(dateOrYear, monthIndex) {
  if (dateOrYear instanceof Date) {
    return new Date(dateOrYear.getFullYear(), dateOrYear.getMonth() + 1, 0).getDate();
  }

  return new Date(dateOrYear, monthIndex + 1, 0).getDate();
}

function buildCsvField(value) {
  if (value === null || value === undefined) return '';

  const rawValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const escaped = rawValue.replace(/"/g, '""');
  if (/[",\r\n]/.test(rawValue)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function formatDataExportPayload(data, format) {
  if (format === 'json') {
    return JSON.stringify(Array.isArray(data) ? data : []);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return '';
  }

  const keySet = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach(k => keySet.add(k));
    } else {
      keySet.add('value');
      break;
    }
  }

  const headers = Array.from(keySet);
  const headerLine = headers.map(buildCsvField).join(',');

  const body = rows.map(row => {
    if (!row || typeof row !== 'object') {
      return buildCsvField(row);
    }

    return headers.map((key) => buildCsvField(row[key])).join(',');
  }).join('\n');

  return `${headerLine}\n${body}`;
}

async function runChatMessageAction(config, userId) {
  const prompt = typeof config.prompt === 'string' ? config.prompt : '';
  if (!prompt.trim()) {
    throw new Error('Chat message prompt is required');
  }

  const providerName = (typeof config.provider === 'string' ? config.provider : config.providerName) || 'claude';
  const provider = getProvider(providerName);
  const chatId = config.chatId || config.chat_id || null;
  const model = config.model || null;

  let response = '';
  let providerError;

  for await (const chunk of provider.query({
    prompt,
    userId,
    chatId,
    model,
    maxTurns: config.maxTurns || 20
  })) {
    if (chunk?.type === 'text' && chunk.content) {
      response += chunk.content;
    } else if (chunk?.type === 'error' && chunk.message) {
      providerError = chunk.message;
    }
  }

  if (providerError) {
    throw new Error(providerError);
  }

  return {
    provider: providerName,
    prompt,
    chatId,
    response,
    responseLength: response.length
  };
}

function getNearestWeekdayInMonth(year, monthIndex, targetDay) {
  const lastDay = getDaysInMonth(year, monthIndex);
  if (targetDay < 1 || targetDay > lastDay) return null;

  const candidate = new Date(year, monthIndex, targetDay);
  const dayOfWeek = candidate.getDay();

  if (dayOfWeek >= 1 && dayOfWeek <= 5) return targetDay;
  if (dayOfWeek === 6) {
    return targetDay === 1 ? 3 : targetDay - 1;
  }

  return targetDay === lastDay ? targetDay - 2 : targetDay + 1;
}

function getLastWeekdayInMonth(year, monthIndex, weekday) {
  const lastDay = getDaysInMonth(year, monthIndex);
  for (let day = lastDay; day >= 1; day -= 1) {
    if (new Date(year, monthIndex, day).getDay() === weekday) {
      return day;
    }
  }
  return null;
}

function getNthWeekdayInMonth(year, monthIndex, weekday, occurrence) {
  const lastDay = getDaysInMonth(year, monthIndex);
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === weekday) {
      count += 1;
      if (count === occurrence) return day;
    }
  }
  return null;
}

function normalizeDow(value) {
  return value === 7 ? 0 : value;
}

function parseCronFieldWithMatchers(field, parseToken) {
  const tokens = String(field || '*').trim().toLowerCase().split(',');
  const matchers = [];
  let isAny = false;

  for (let rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) return null;

    if (token === '*' || token === '?') {
      isAny = true;
      break;
    }

    const matcher = parseToken(token);
    if (!matcher) return null;
    if (matcher.any) {
      isAny = true;
      break;
    }

    matchers.push(matcher);
  }

  if (isAny) return { any: true, matchers: [] };
  if (!matchers.length) return null;
  return { any: false, matchers };
}

function parseCronDayOfMonthToken(token) {
  if (token === 'l') {
    return {
      test: (date) => date.getDate() === getDaysInMonth(date.getFullYear(), date.getMonth())
    };
  }

  if (token === 'l-0') {
    return {
      test: (date) => date.getDate() === getDaysInMonth(date.getFullYear(), date.getMonth())
    };
  }

  if (token.endsWith('w')) {
    const dayRaw = token.slice(0, -1);
    const day = Number(dayRaw);
    if (!Number.isInteger(day)) return null;
    if (day < 1 || day > 31) return null;
    return {
      test: (date) => {
        const nearest = getNearestWeekdayInMonth(date.getFullYear(), date.getMonth(), day);
        return nearest !== null && date.getDate() === nearest;
      }
    };
  }

  if (token.startsWith('l-')) {
    const offset = Number(token.slice(2));
    if (!Number.isInteger(offset) || offset < 0) return null;
    return {
      test: (date) => {
        const lastDay = getDaysInMonth(date.getFullYear(), date.getMonth());
        const target = lastDay - offset;
        return target >= 1 && date.getDate() === target;
      }
    };
  }

  const parsed = parseCronFieldValuesFromSegment(token, { min: 1, max: 31 });
  if (!parsed || parsed.any || !parsed.values.size) return null;

  return {
    test: (date) => parsed.values.has(date.getDate())
  };
}

function parseCronDayOfWeekToken(token) {
  if (token.includes('l')) {
    const base = token.slice(0, -1);
    if (!base) return null;
    const parsedDay = toCronNumber(base, 0, 7, DOW_ALIASES);
    if (parsedDay === null) return null;
    const weekday = normalizeDow(parsedDay);

    return {
      test: (date) => {
        const lastWeekday = getLastWeekdayInMonth(date.getFullYear(), date.getMonth(), weekday);
        return lastWeekday !== null && date.getDate() === lastWeekday;
      }
    };
  }

  if (token.includes('#')) {
    const parts = token.split('#');
    if (parts.length !== 2) return null;
    const dayRaw = parts[0];
    const occRaw = parts[1];
    const day = toCronNumber(dayRaw, 0, 7, DOW_ALIASES);
    const occurrence = Number(occRaw);
    if (day === null || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 5) return null;
    const weekday = normalizeDow(day);

    return {
      test: (date) => {
        const nth = getNthWeekdayInMonth(date.getFullYear(), date.getMonth(), weekday, occurrence);
        return nth !== null && date.getDate() === nth;
      }
    };
  }

  const parsed = parseCronFieldValuesFromSegment(token, { min: 0, max: 7, aliases: DOW_ALIASES });
  if (!parsed || !parsed.values.size) return null;
  const weekdays = new Set(
    [...parsed.values].map((value) => normalizeDow(value))
  );

  return {
    test: (date) => weekdays.has(date.getDay())
  };
}

function parseCronDayOfMonthField(field) {
  return parseCronFieldWithMatchers(field, parseCronDayOfMonthToken);
}

function parseCronDayOfWeekField(field) {
  return parseCronFieldWithMatchers(field, parseCronDayOfWeekToken);
}

function matchesCronField(date, field) {
  if (field.any) return true;
  return field.matchers.some((matcher) => matcher.test(date));
}

/**
 * Parse a standard 5-field cron expression and return the next run date.
 * Supports: minute hour day month weekday with:
 * - wildcards
 * - numbers
 * - ranges (e.g. 1-5)
 * - steps (e.g. every 15 minutes, 0-30/10)
 * - name aliases for month/day-of-week
 * - day-specific modifiers: ?, L, W, and # expressions
 */
export function getNextCronRun(cronExpression) {
  const parts = String(cronExpression || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minutePart, hourPart, domPart, monthPart, dowPart] = parts;

  const minute = parseCronField(minutePart, { min: 0, max: 59 });
  const hour = parseCronField(hourPart, { min: 0, max: 23 });
  const dayOfMonth = parseCronDayOfMonthField(domPart);
  const month = parseCronField(monthPart, { min: 1, max: 12, aliases: MONTH_ALIASES });
  const dayOfWeek = parseCronDayOfWeekField(dowPart);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;

  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < MAX_DAILY_CRON_LOOKAHEAD_MINUTES; i += 1) {
    const current = new Date(next);
    const minuteOk = minute.any || minute.values.has(current.getMinutes());
    const hourOk = hour.any || hour.values.has(current.getHours());
    const monthOk = month.any || month.values.has(current.getMonth() + 1);
    const domOk = matchesCronField(current, dayOfMonth);
    const dowOk = matchesCronField(current, dayOfWeek);

    // Cron semantics: if both DOM and DOW are specified, either may match.
    let domAndDowMatch = false;
    if (dayOfMonth.any && dayOfWeek.any) {
      domAndDowMatch = true;
    } else if (dayOfMonth.any) {
      domAndDowMatch = dowOk;
    } else if (dayOfWeek.any) {
      domAndDowMatch = domOk;
    } else {
      domAndDowMatch = domOk || dowOk;
    }

    if (minuteOk && hourOk && monthOk && domAndDowMatch) {
      return current;
    }

    next.setMinutes(next.getMinutes() + 1);
  }

  return null;
}

/** Calculate next_run_at for a job based on its type. */
function calculateNextRun(job) {
  const now = new Date();

  if (job.job_type === 'one_time') {
    return job.execute_at ? new Date(job.execute_at) : null;
  }

  if (job.job_type === 'recurring' && job.interval_seconds) {
    return new Date(now.getTime() + job.interval_seconds * 1000);
  }

  if (job.job_type === 'cron' && job.cron_expression) {
    return getNextCronRun(job.cron_expression);
  }

  return null;
}

function normalizeWebhookHost(hostname) {
  return String(hostname || '').toLowerCase();
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  return (
    parts[0] === 10 ||
    (parts[0] === 127) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 0) ||
    parts[0] === 169 && parts[1] === 254 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
  );
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168')
  );
}

function isPrivateAddress(address) {
  if (!address) return true;
  if (net.isIPv4(address)) return isPrivateIPv4(address);
  if (net.isIPv6(address)) return isPrivateIPv6(address);
  return true;
}

function isDnsNameBlocked(hostname) {
  const normalized = normalizeWebhookHost(hostname);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  return false;
}

function getWebhookHostAllowlist() {
  const raw = process.env.WEBHOOK_HOST_ALLOWLIST;
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedByHostPolicy(hostname, allowlist) {
  const normalized = normalizeWebhookHost(hostname);
  if (allowlist.length === 0) return true;

  return allowlist.some((entry) => {
    if (entry.startsWith('*.')) {
      return normalized.endsWith(entry.slice(1));
    }
    return normalized === entry;
  });
}

async function validateWebhookUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use http or https');
  }

  const hostname = normalizeWebhookHost(parsed.hostname);
  if (!hostname) throw new Error('Webhook URL must include a hostname');
  if (isDnsNameBlocked(hostname)) {
    throw new Error('Webhook host is not allowed');
  }

  const allowlist = getWebhookHostAllowlist();
  if (!isAllowedByHostPolicy(hostname, allowlist)) {
    throw new Error(`Webhook host "${hostname}" is not in the allowlist`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Webhook host is in a private network');
    }
    return parsed;
  }

  const records = await dnsLookup(hostname, { all: true });
  if (!records.length) {
    throw new Error('Could not resolve webhook hostname');
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error('Webhook resolves to a private address');
    }
  }

  return parsed;
}

/** Execute a single job. */
async function executeJob(job) {
  const startTime = Date.now();
  let execution = null;

  try {
    // Create execution record
    execution = await jobStore.addJobExecution(job.id, job.user_id, {
      status: 'running',
      startedAt: new Date().toISOString()
    });

    let result = {};

    switch (job.action_type) {
      case 'report_generation': {
        const config = job.action_config;
        if (config.reportId) {
          const report = await reportStore.getSavedReport(config.reportId, job.user_id);
          if (report) {
            const queryResult = await reportStore.executeCustomQuery(job.user_id, report.report_config);
            await reportStore.updateReportResult(config.reportId, job.user_id, queryResult);
            result = { reportId: config.reportId, rowCount: Array.isArray(queryResult) ? queryResult.length : 0 };
          } else {
            throw new Error('Report not found: ' + config.reportId);
          }
        }
        break;
      }

      case 'webhook': {
        const config = job.action_config;
        if (!config.url) throw new Error('Webhook URL is required');

        const parsedUrl = await validateWebhookUrl(config.url);
        const method = (config.method || 'POST').toUpperCase();
        const allowedMethods = new Set(['GET', 'POST']);
        if (!allowedMethods.has(method)) {
          throw new Error(`Webhook method not allowed: ${method}`);
        }

        const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
        const timeoutMs = 20_000;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const body = config.body ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body)) : null;

        const fetchOpts = {
          method,
          headers
        };
        if (body) {
          fetchOpts.body = body;
        }
        fetchOpts.signal = controller.signal;

        try {
          const resp = await fetch(parsedUrl, fetchOpts);
          const responseText = await resp.text().catch(() => '');
          result = {
            status: resp.status,
            statusText: resp.statusText,
            body: responseText
          };
          if (!resp.ok) {
            throw new Error(`Webhook returned ${resp.status}: ${resp.statusText}${responseText ? `: ${responseText}` : ''}`);
          }
        } finally {
          clearTimeout(timeout);
        }

        break;
      }

      case 'data_export': {
        const config = job.action_config;
        const rawSource = (config.source || 'messages').toLowerCase();
        const format = (config.format || 'json').toLowerCase();
        if (!ALLOWED_EXPORT_FORMATS.has(format)) {
          throw new Error(`Unsupported data_export format: ${format}`);
        }

        let data;
        let source = rawSource;
        if (source === 'chats') {
          source = 'messages';
        } else if (source === 'provider_usage') {
          source = 'providers';
        }

        if (source === 'messages') {
          data = await reportStore.getDailyMessages(job.user_id, 365);
        } else if (source === 'providers') {
          data = await reportStore.getProviderUsage(job.user_id, 365);
        } else {
          throw new Error(`Unsupported data_export source: ${rawSource}`);
        }

        const rowCount = Array.isArray(data) ? data.length : 0;
        result = {
          format,
          rowCount,
          source,
          data: formatDataExportPayload(data, format),
          contentType: format === 'csv' ? 'text/csv' : 'application/json'
        };
        break;
      }

      case 'chat_message': {
        result = await runChatMessageAction(job.action_config || {}, job.user_id);
        break;
      }

      case 'run_workflow': {
        const config = job.action_config || {};
        const workflowId = config.workflowId || config.workflow_id;
        if (!workflowId) throw new Error('run_workflow requires workflowId in action_config');
        const workflow = await workflowStore.getWorkflow(workflowId, job.user_id);
        if (!workflow) throw new Error('Workflow not found: ' + workflowId);
        const options = await getWorkflowRunOptions(workflow, job.user_id);
        const runResult = await runWorkflow(workflow, job.user_id, {
          ...options,
          providerName: config.provider || 'claude',
          model: config.model || null
        });
        result = { executionId: runResult.executionId, status: runResult.status, durationMs: runResult.durationMs, error: runResult.error };
        break;
      }

      default:
        throw new Error('Unknown action type: ' + job.action_type);
    }

    const duration = Date.now() - startTime;
    await jobStore.updateJobExecution(execution.id, {
      status: 'success',
      completedAt: new Date().toISOString(),
      durationMs: duration,
      result
    });

    const updates = {
      lastRunAt: new Date().toISOString(),
      runCount: (job.run_count || 0) + 1,
      lastError: null
    };

    if (job.job_type === 'one_time') {
      updates.status = 'completed';
      updates.nextRunAt = null;
    } else {
      updates.status = 'active';
      const nextRun = calculateNextRun(job);
      updates.nextRunAt = nextRun ? nextRun.toISOString() : null;
    }

    await jobStore.updateJob(job.id, job.user_id, updates);

    console.log(`[SCHEDULER] Job ${job.id} (${job.name}) completed in ${duration}ms`);
  } catch (err) {
    console.error(`[SCHEDULER] Job ${job.id} (${job.name}) failed:`, err.message);

    const duration = Date.now() - startTime;
    const nextRun = job.job_type === 'one_time'
      ? null
      : calculateNextRun(job);
    const updates = {
      lastRunAt: new Date().toISOString(),
      nextRunAt: nextRun ? nextRun.toISOString() : null,
      lastError: err.message,
      runCount: (job.run_count || 0) + 1,
      status: job.job_type === 'one_time' ? 'completed' : 'active'
    };

    if (execution) {
      jobStore.updateJobExecution(execution.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs: duration,
        error: err.message
      }).catch(e => console.error('[SCHEDULER] Failed to update execution:', e.message));
    }

    await jobStore.updateJob(job.id, job.user_id, updates)
      .catch(e => console.error('[SCHEDULER] Failed to update job:', e.message));
  }
}

async function recoverStaleClaims() {
  try {
    await jobStore.recoverStaleRunningJobs(CLAIM_LEASE_MS);
  } catch (err) {
    console.error('[SCHEDULER] Recover stale claim error:', err.message);
  }
}

/** Poll DB for due jobs and execute them. */
async function pollAndExecute() {
  try {
    await recoverStaleClaims();
    const dueJobs = await jobStore.getDueJobs();

    for (const job of dueJobs) {
      const claimed = job.next_run_at
        ? await jobStore.claimDueJob(job.id, job.user_id, job.next_run_at, CLAIM_LEASE_MS)
        : null;

      if (!claimed) continue;

      executeJob(claimed).catch(err => {
        console.error(`[SCHEDULER] Unhandled error for job ${job.id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[SCHEDULER] Poll error:', err.message);
  }
}

/** Initialize the scheduler: load active jobs, start polling. */
export async function startScheduler() {
  console.log('[SCHEDULER] Starting job scheduler');

  try {
    const activeJobs = await jobStore.getActiveJobs();
    console.log(`[SCHEDULER] Found ${activeJobs.length} active jobs`);

    // Set next_run_at for jobs that don't have one
    for (const job of activeJobs) {
      if (!job.next_run_at) {
        const nextRun = calculateNextRun(job);
        if (nextRun) {
          await jobStore.updateJob(job.id, job.user_id, {
            nextRunAt: nextRun.toISOString(),
            status: 'active'
          });
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Failed to load active jobs:', err.message);
  }

  await recoverStaleClaims();

  // Start polling
  pollTimer = setInterval(pollAndExecute, POLL_INTERVAL_MS);

  // Run initial poll
  pollAndExecute();
}

/** Stop the scheduler. */
export function stopScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log('[SCHEDULER] Stopped');
}

/** Manually trigger a job to run immediately. */
export async function triggerJob(jobId, userId) {
  const job = await jobStore.getJob(jobId, userId);
  if (!job) throw new Error('Job not found');
  await executeJob(job);
  return job;
}
