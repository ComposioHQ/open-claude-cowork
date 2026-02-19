import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

// ── Folders ──────────────────────────────────────────────────

export async function createFolder(userId, name, parentId = null) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('vault_folders')
    .insert({ user_id: userId, name, parent_id: parentId })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getUserFolders(userId, parentId = null) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('vault_folders')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function renameFolder(folderId, userId, name) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('vault_folders')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function deleteFolder(folderId, userId) {
  if (isAnonymousUserId(userId)) return;
  const { error } = await db()
    .from('vault_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId);
  if (error) return fallbackForMissingSchema(error);
}

export async function moveFolder(folderId, userId, newParentId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('vault_folders')
    .update({ parent_id: newParentId || null, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getFolderBreadcrumbs(folderId, userId) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db()
    .rpc('get_folder_breadcrumbs', { folder_uuid: folderId, user_uuid: userId });
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

// ── Assets (attachments) ─────────────────────────────────────

export async function getVaultAssets(userId, folderId = null, opts = {}) {
  if (isAnonymousUserId(userId)) return [];
  const { sort = 'created_at', dir = 'desc', source, limit = 50, offset = 0 } = opts;

  let query = db()
    .from('attachments')
    .select('*')
    .eq('user_id', userId)
    .order(sort, { ascending: dir === 'asc' })
    .range(offset, offset + limit - 1);

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;
  if (error) return fallbackForMissingSchema(error, []);
  return data || [];
}

export async function moveAsset(attachmentId, userId, folderId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('attachments')
    .update({ folder_id: folderId || null, updated_at: new Date().toISOString() })
    .eq('id', attachmentId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function renameAsset(attachmentId, userId, displayName) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('attachments')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', attachmentId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateAsset(attachmentId, userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  const allowed = {};
  if (updates.display_name !== undefined) allowed.display_name = updates.display_name;
  if (updates.description !== undefined) allowed.description = updates.description;
  if (updates.folder_id !== undefined) allowed.folder_id = updates.folder_id || null;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await db()
    .from('attachments')
    .update(allowed)
    .eq('id', attachmentId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getVaultStats(userId) {
  if (isAnonymousUserId(userId)) return { folderCount: 0, assetCount: 0, totalSize: 0 };
  const [foldersRes, assetsRes] = await Promise.all([
    db().from('vault_folders').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db().from('attachments').select('file_size', { count: 'exact' }).eq('user_id', userId)
  ]);

  if (foldersRes.error) return fallbackForMissingSchema(foldersRes.error, { folderCount: 0, assetCount: 0, totalSize: 0 });
  if (assetsRes.error) return fallbackForMissingSchema(assetsRes.error, { folderCount: 0, assetCount: 0, totalSize: 0 });

  const totalSize = (assetsRes.data || []).reduce((sum, r) => sum + (r.file_size || 0), 0);

  return {
    folderCount: foldersRes.count || 0,
    assetCount: assetsRes.count || 0,
    totalSize
  };
}
