import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

// ==================== RPC REPORT QUERIES ====================

export async function getDailyMessages(userId, days = 30) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db().rpc('report_daily_messages', {
    p_user_id: userId,
    p_days: days
  });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getProviderUsage(userId, days = 30) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db().rpc('report_provider_usage', {
    p_user_id: userId,
    p_days: days
  });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getToolUsage(userId, days = 30) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db().rpc('report_tool_usage', {
    p_user_id: userId,
    p_days: days
  });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getSummary(userId) {
  if (isAnonymousUserId(userId)) {
    return { total_chats: 0, total_messages: 0, active_days: 0, avg_messages_per_day: 0 };
  }

  const { data, error } = await db().rpc('report_summary', {
    p_user_id: userId
  });
  if (error) return fallbackForMissingSchema(error, { total_chats: 0, total_messages: 0, active_days: 0, avg_messages_per_day: 0 });
  return data?.[0] || { total_chats: 0, total_messages: 0, active_days: 0, avg_messages_per_day: 0 };
}

export async function executeCustomQuery(userId, config) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db().rpc('report_custom_query', {
    p_user_id: userId,
    p_config: config
  });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

// ==================== SAVED REPORTS CRUD ====================

export async function getSavedReports(userId) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db()
    .from('saved_reports')
    .select('id, name, description, report_config, last_run_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function getSavedReport(reportId, userId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('saved_reports')
    .select('*')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    return fallbackForMissingSchema(error, null);
  }
  return data;
}

export async function createSavedReport(userId, { name, description, reportConfig }) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('saved_reports')
    .insert({
      user_id: userId,
      name,
      description: description || '',
      report_config: reportConfig
    })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateSavedReport(reportId, userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.reportConfig !== undefined) payload.report_config = updates.reportConfig;
  if (updates.folder_id !== undefined) payload.folder_id = updates.folder_id || null;

  const { data, error } = await db()
    .from('saved_reports')
    .update(payload)
    .eq('id', reportId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function deleteSavedReport(reportId, userId) {
  if (isAnonymousUserId(userId)) return;
  const { error } = await db()
    .from('saved_reports')
    .delete()
    .eq('id', reportId)
    .eq('user_id', userId);
  if (error) return fallbackForMissingSchema(error);
}

export async function updateReportResult(reportId, userId, result) {
  if (!reportId) return null;
  let query = db()
    .from('saved_reports')
    .update({ last_result: result, last_run_at: new Date().toISOString() })
    .eq('id', reportId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) return fallbackForMissingSchema(error, null);
  return null;
}
