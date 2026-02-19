import { getAdminClient, getUserClient } from './client.js';
import crypto from 'crypto';


/** Parse ADMIN_EMAILS env var into a Set of lowercased email addresses. */
function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return new Set();
  return new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

function getAnonymousSessionId(req) {
  const explicit = req?.get?.('x-anon-session-id');
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const ip = req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown-ip';
  const ua = req?.get?.('user-agent') || 'unknown-ua';
  return crypto.createHash('sha256')
    .update(`${ip}|${ua}`)
    .digest('hex')
    .slice(0, 16);
}

function getActorUserId(req) {
  if (req?.user?.id !== 'anonymous') return req?.user?.id;
  return `anonymous:${getAnonymousSessionId(req)}`;
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) return null;
  return bearerMatch[1];
}

function normalizeSupabaseUrl(url) {
  return (url || '').replace(/\/$/, '');
}

async function verifyTokenWithSupabaseUserEndpoint(token) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const response = await fetch(`${normalizeSupabaseUrl(supabaseUrl)}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return null;

    const authUser = await response.json();
    if (!authUser || !authUser.id || !authUser.email) return null;

    return { id: authUser.id, email: authUser.email, role: authUser.role || 'authenticated' };
  } catch {
    return null;
  }
}

/**
 * Express middleware that validates a Supabase JWT from the Authorization header.
 * Sets req.user = { id, email, role } on success.
 * No anonymous fallback is allowed here.
 */
export async function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (token) {
    try {
      const directUser = await verifyTokenWithSupabaseUserEndpoint(token);
      if (directUser) {
        req.user = directUser;
        return next();
      }

      const userClient = getUserClient(token);
      const { data: { user: authUser }, error: userError } = await userClient.auth.getUser(token);
      if (authUser && !userError) {
        req.user = { id: authUser.id, email: authUser.email, role: authUser.role };
        return next();
      }
    } catch {
      // Fall through to admin verification if user token check fails.
    }

    try {
      const admin = getAdminClient();
      const { data: { user: adminUser }, error: adminError } = await admin.auth.getUser(token);
      if (!adminError && adminUser) {
        req.user = { id: adminUser.id, email: adminUser.email, role: adminUser.role };
        return next();
      }
    } catch {
      // Keep behavior: unauthenticated when both user and admin checks fail.
    }

    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (process.env.ALLOW_ANONYMOUS === 'true') {
    const sessionId = getAnonymousSessionId(req);
    req.user = { id: `anonymous:${sessionId}`, email: null, role: 'anon' };
    return next();
  }

  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * Express middleware that checks whether the authenticated user is an admin.
 * Must be chained after requireAuth (reads req.user.email).
 * Returns 403 if the user's email is not in the ADMIN_EMAILS env var.
 */
export function requireAdmin(req, res, next) {
  const adminEmails = getAdminEmails();
  if (adminEmails.size === 0) {
    return res.status(403).json({ error: 'No admin emails configured' });
  }
  const email = req.user?.email;
  if (!email || !adminEmails.has(email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

/**
 * Check if the current user is an admin (non-middleware helper).
 */
export function isAdmin(email) {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.has(email.toLowerCase());
}
