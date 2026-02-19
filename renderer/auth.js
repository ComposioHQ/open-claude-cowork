/**
 * Frontend auth module — uses Supabase JS client loaded via CDN.
 * Exposes: initAuth(), getAuthToken(), getAuthHeaders(), onAuthReady callback.
 */
(function () {
  let supabaseClient = null;
  let currentSession = null;

  // Fetch Supabase config from server, then initialize
    async function initAuth(onReady) {
      try {
        const base = window._apiBase || '';
        const res = await fetch(base + '/api/config');
        const config = await res.json();

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        const err = new Error('Auth service is not configured');
        if (onReady) onReady(null, { error: err.message });
        return;
      }

      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      // Listen for auth state changes
      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentSession = session;

        // Store token for Electron preload
        if (window.electronAPI && window.electronAPI.setAuthToken) {
          window.electronAPI.setAuthToken(session?.access_token || null);
        }
      });

      // Check existing session
      const { data: { session } } = await supabaseClient.auth.getSession();
      currentSession = session;

      if (window.electronAPI && window.electronAPI.setAuthToken) {
        window.electronAPI.setAuthToken(session?.access_token || null);
      }

      if (onReady) onReady(session);
  } catch (err) {
    console.error('[AUTH] Init failed:', err);
      if (onReady) onReady(null, { error: err?.message || String(err) });
    }
  }

  async function signUp(email, password, displayName) {
    if (!supabaseClient) throw new Error('Auth not initialized');
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split('@')[0] } }
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    if (!supabaseClient) throw new Error('Auth not initialized');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentSession = null;
  }

  async function resetPassword(email) {
    if (!supabaseClient) throw new Error('Auth not initialized');
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname + (window.location.search || '')
    });
    if (error) throw error;
    return data;
  }

  function getAuthToken() {
    return currentSession?.access_token || null;
  }

  function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  function getUser() {
    return currentSession?.user || null;
  }

  function isAuthenticated() {
    return !!currentSession;
  }

  // Expose globally
  window.appAuth = {
    initAuth,
    signUp,
    signIn,
    signOut,
    resetPassword,
    getAuthToken,
    getAuthHeaders,
    getUser,
    isAuthenticated
  };
})();
