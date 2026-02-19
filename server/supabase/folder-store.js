import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

export async function createFolder(userId, name, type, parentId = null) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('universal_folders')
    .insert([{ user_id: userId, name, type, parent_id: parentId }])
    .select()
    .single();

  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getFolders(userId, type, parentId = null) {
  if (isAnonymousUserId(userId)) return [];
  let query = db()
    .from('universal_folders')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type);

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.eq('parent_id', null);
  }

  const { data, error } = await query.order('name');
  if (error) return fallbackForMissingSchema(error, []);
  return data;
}

export async function renameFolder(folderId, userId, newName) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('universal_folders')
    .update({ name: newName })
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
    .from('universal_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId);

  if (error) return fallbackForMissingSchema(error);
  return true;
}

export async function getBreadcrumbs(folderId, userId) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db().rpc('get_universal_folder_breadcrumbs', {
    p_folder_id: folderId,
    p_user_id: userId
  });

  if (error) return fallbackForMissingSchema(error, []);
  return data;
}
