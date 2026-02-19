import { getAdminClient } from './client.js';
import crypto from 'crypto';

const db = () => getAdminClient();
const BUCKET = 'attachments';

export async function uploadFile(userId, file, chatId = null) {
  const ext = file.originalname.split('.').pop();
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db().storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
  if (uploadError) throw uploadError;

  // Record metadata in attachments table
  const { data, error: dbError } = await db()
    .from('attachments')
    .insert({
      user_id: userId,
      chat_id: chatId,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath
    })
    .select()
    .single();
  if (dbError) throw dbError;

  return data;
}

export async function getFileUrl(attachmentId, userId) {
  const { data: attachment, error } = await db()
    .from('attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;

  const { data: urlData, error: urlError } = await db().storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 3600); // 1 hour expiry
  if (urlError) throw urlError;

  return urlData.signedUrl;
}

export async function deleteFile(attachmentId, userId) {
  const { data: attachment, error: fetchError } = await db()
    .from('attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw fetchError;

  // Delete from storage
  const { error: storageError } = await db().storage
    .from(BUCKET)
    .remove([attachment.storage_path]);
  if (storageError) throw storageError;

  // Delete metadata
  const { error: dbError } = await db()
    .from('attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('user_id', userId);
  if (dbError) throw dbError;
}

export async function uploadVaultFile(userId, file, folderId = null, source = 'upload') {
  const ext = file.originalname.split('.').pop();
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db().storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data, error: dbError } = await db()
    .from('attachments')
    .insert({
      user_id: userId,
      file_name: file.originalname,
      display_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath,
      folder_id: folderId || null,
      source
    })
    .select()
    .single();
  if (dbError) throw dbError;

  return data;
}
