#!/usr/bin/env node
/**
 * Test that a scheduled workflow actually runs:
 * 1. Sign in, pick one job (e.g. "Reminder check"), set it to run "now" (next_run_at = now).
 * 2. Wait for scheduler poll (90s; backend polls every 60s).
 * 3. Fetch job executions and assert at least one run.
 *
 * Usage:
 *   BASE_URL=https://cowork.ignitabull.org TEST_USER_EMAIL=... TEST_USER_PASSWORD=... node scripts/test-scheduled-run.js
 */
const BASE_URL = (process.env.BASE_URL || 'https://cowork.ignitabull.org').replace(/\/$/, '');
const EMAIL = process.env.TEST_USER_EMAIL || 'autotest+e2e@coworktest.local';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';
const JOB_NAME = process.env.TEST_JOB_NAME || 'Reminder check';
const WAIT_SEC = parseInt(process.env.TEST_WAIT_SEC || '90', 10);

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
  const job = Array.isArray(jobs) && jobs.find((j) => j.name === JOB_NAME);
  if (!job) throw new Error('Job not found: ' + JOB_NAME);

  const now = new Date();
  const runAt = new Date(now.getTime() - 5000).toISOString(); // 5s ago so it's due
  console.log('Setting job "' + JOB_NAME + '" to run now (next_run_at in past)...');
  const patchRes = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_type: 'one_time',
      execute_at: runAt,
      next_run_at: runAt,
    }),
  });
  if (!patchRes.ok) throw new Error('PATCH job: ' + patchRes.status + ' ' + await patchRes.text());

  console.log('Waiting', WAIT_SEC, 's for scheduler to pick it up (polls every 60s)...');
  await new Promise((r) => setTimeout(r, WAIT_SEC * 1000));

  const execRes = await fetch(`${BASE_URL}/api/jobs/${job.id}/executions?limit=5`, { headers: auth });
  if (!execRes.ok) throw new Error('GET executions: ' + execRes.status);
  const execData = await execRes.json();
  const executions = execData.executions || execData.data || execData || [];
  const recent = Array.isArray(executions) ? executions : [];

  if (recent.length === 0) {
    console.error('No executions found. Scheduler may not have run yet or job type one_time may clear next_run_at.');
    process.exit(1);
  }
  const latest = recent[0];
  console.log('Latest execution:', latest.status, 'started_at:', latest.started_at);
  if (latest.status === 'running' || latest.status === 'completed') {
    console.log('OK: Scheduled run executed.');
    process.exit(0);
  }
  console.error('Unexpected status:', latest.status);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
