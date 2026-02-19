#!/usr/bin/env node
/**
 * Create a Supabase Auth test user (for E2E / deployed app testing).
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env or 1Password.
 * Usage: node scripts/create-test-user.js [email] [password]
 */
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const email = process.argv[2] || `autotest+${Date.now()}@coworktest.local`;
const password = process.argv[3] || 'TestPassword123!';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use 1Password refs with op run)');
  process.exit(1);
}

const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`;
async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('Create user failed:', res.status, body);
    process.exit(1);
  }
  console.log(JSON.stringify({ email, password, id: body.id }, null, 2));
}
main();
