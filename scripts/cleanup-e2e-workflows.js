#!/usr/bin/env node
/**
 * Remove duplicate "E2E test workflow" jobs for the test user, keeping only the most recent.
 * Leaves "Daily digest", "Weekly recap", "Reminder check" and other jobs untouched.
 *
 * Usage:
 *   BASE_URL=https://cowork.ignitabull.org TEST_USER_EMAIL=... TEST_USER_PASSWORD=... node scripts/cleanup-e2e-workflows.js
 */
const BASE_URL = (process.env.BASE_URL || 'https://cowork.ignitabull.org').replace(/\/$/, '');
const EMAIL = process.env.TEST_USER_EMAIL || 'autotest+e2e@coworktest.local';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';
const E2E_JOB_NAME = 'E2E test workflow';

async function getToken() {
  const configRes = await fetch(`${BASE_URL}/api/config`);
  if (!configRes.ok) throw new Error('Config: ' + configRes.status);
  const config = await configRes.json();
  const supabaseUrl = (config.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = config.supabaseAnonKey || config.supabase_anon_key;
  if (!supabaseUrl || !anonKey) throw new Error('Missing supabase config');

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!tokenRes.ok) throw new Error('Sign-in: ' + tokenRes.status + ' ' + await tokenRes.text());
  const data = await tokenRes.json();
  if (!data.access_token) throw new Error('No access_token');
  return { token: data.access_token };
}

async function main() {
  console.log('Getting token...');
  const { token } = await getToken();
  const auth = { Authorization: `Bearer ${token}` };

  const jobsRes = await fetch(`${BASE_URL}/api/jobs`, { headers: auth });
  if (!jobsRes.ok) throw new Error('GET /api/jobs: ' + jobsRes.status);
  const jobsData = await jobsRes.json();
  const jobs = jobsData.jobs || jobsData.data || jobsData;
  const list = Array.isArray(jobs) ? jobs : [];

  const e2eJobs = list.filter((j) => j.name === E2E_JOB_NAME);
  if (e2eJobs.length === 0) {
    console.log('No jobs named "' + E2E_JOB_NAME + '". Nothing to clean.');
    return;
  }

  // Sort by updated_at descending (most recent first); keep first, delete rest
  e2eJobs.sort((a, b) => {
    const ta = (a.updated_at || a.created_at || '').toString();
    const tb = (b.updated_at || b.created_at || '').toString();
    return tb.localeCompare(ta);
  });
  const toDelete = e2eJobs.slice(1);
  if (toDelete.length === 0) {
    console.log('Only one "' + E2E_JOB_NAME + '" job. Nothing to clean.');
    return;
  }

  console.log('Deleting', toDelete.length, 'duplicate job(s), keeping most recent...');
  for (const job of toDelete) {
    const delRes = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    if (!delRes.ok) throw new Error('DELETE /api/jobs/' + job.id + ': ' + delRes.status);
    console.log('  Deleted:', job.id);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
