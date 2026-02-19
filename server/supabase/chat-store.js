import { getAdminClient } from './client.js';
import { fallbackForMissingSchema, isAnonymousUserId } from './supabase-schema-guard.js';

const db = () => getAdminClient();

function ownershipError(message, code = 'CHAT_FORBIDDEN') {
  const err = new Error(message);
  err.code = code;
  return err;
}

export async function getChatOwner(chatId) {
  if (!chatId || isAnonymousUserId(chatId)) return null;

  const { data, error } = await db()
    .from('chats')
    .select('user_id')
    .eq('id', chatId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    return fallbackForMissingSchema(error, null);
  }

  return data?.user_id || null;
}

export async function createChat({ id, userId, title, provider, model }) {
  if (isAnonymousUserId(userId)) return null;
  if (!id) {
    const err = new Error('chat id is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const existingOwner = await getChatOwner(id);

  if (existingOwner) {
    if (existingOwner !== userId) {
      throw ownershipError('Chat id already belongs to another user', 'CHAT_OWNERSHIP_VIOLATION');
    }

    const payload = {};
    if (title !== undefined) payload.title = title;
    if (provider !== undefined) payload.provider = provider;
    if (model !== undefined) payload.model = model;

    const { data: existingData, error: existingErr } = await db()
      .from('chats')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (existingErr) throw existingErr;
    return existingData;
  }

  const { data, error } = await db()
    .from('chats')
    .insert({ id, user_id: userId, title, provider, model })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getUserChats(userId) {
  if (isAnonymousUserId(userId)) return [];
  const { data, error } = await db()
    .from('chats')
    .select('id, title, provider, model, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return fallbackForMissingSchema(error, []);
  return data;
}

export async function getChat(chatId, userId) {
  if (isAnonymousUserId(userId)) return null;
  const { data: chat, error: chatError } = await db()
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();
  if (chatError) return fallbackForMissingSchema(chatError, null);

  const { data: messages, error: msgError } = await db()
    .from('messages')
    .select('id, role, content, html, metadata, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (msgError) return fallbackForMissingSchema(msgError, []);

  return { ...chat, messages };
}

export async function deleteChat(chatId, userId) {
  if (isAnonymousUserId(userId)) return;
  const { error } = await db()
    .from('chats')
    .delete()
    .eq('id', chatId)
    .eq('user_id', userId);
  if (error) return fallbackForMissingSchema(error);
}

export async function updateChatTitle(chatId, userId, title) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('chats')
    .update({ title })
    .eq('id', chatId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function updateChat(chatId, userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  const allowedUpdates = {};
  if (updates.title !== undefined) allowedUpdates.title = updates.title;
  if (updates.folder_id !== undefined) allowedUpdates.folder_id = updates.folder_id || null;
  if (updates.metadata !== undefined) allowedUpdates.metadata = updates.metadata;

  const { data, error } = await db()
    .from('chats')
    .update(allowedUpdates)
    .eq('id', chatId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function addMessage({ chatId, userId, role, content, html, metadata }) {
  if (isAnonymousUserId(userId)) return null;
  const owner = await getChatOwner(chatId);

  if (!owner) {
    throw ownershipError('Chat not found', 'PGRST116');
  }

  if (owner !== userId) {
    throw ownershipError('Chat does not belong to this user', 'CHAT_FORBIDDEN');
  }

  const { data, error } = await db()
    .from('messages')
    .insert({ chat_id: chatId, user_id: userId, role, content, html: html || '', metadata: metadata || {} })
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}

export async function getChatMessages(chatId) {
  if (isAnonymousUserId(chatId)) return [];
  const { data, error } = await db()
    .from('messages')
    .select('id, role, content, html, metadata, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) return fallbackForMissingSchema(error, []);
  return data;
}

export async function getProfile(userId) {
  if (isAnonymousUserId(userId)) return null;
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  if (error && error.code === 'PGRST116') return null;
  return data;
}

export async function updateProfile(userId, updates) {
  if (isAnonymousUserId(userId)) return null;
  if (!updates || typeof updates !== 'object') return null;

  const allowedProfileFields = new Set([
    'display_name',
    'avatar_url'
  ]);

  const sanitizedUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedProfileFields.has(key)) {
      sanitizedUpdates[key] = value;
    }
  }

  if (!Object.keys(sanitizedUpdates).length) return null;

  const { data, error } = await db()
    .from('profiles')
    .update(sanitizedUpdates)
    .eq('id', userId)
    .select()
    .single();
  if (error) return fallbackForMissingSchema(error, null);
  return data;
}
