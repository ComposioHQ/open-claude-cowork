import { getAdminClient } from './client.js';

const db = () => getAdminClient();

export async function getProviderSession(chatId, provider, userId) {
  let query = db()
    .from('provider_sessions')
    .select('session_id')
    .eq('chat_id', chatId)
    .eq('provider', provider);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data?.session_id || null;
}

export async function setProviderSession(chatId, provider, sessionId, userId) {
  const { error } = await db()
    .from('provider_sessions')
    .upsert(
      { chat_id: chatId, provider, session_id: sessionId, user_id: userId },
      { onConflict: 'chat_id,provider' }
    );
  if (error) throw error;
}
