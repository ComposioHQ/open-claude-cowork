#!/usr/bin/env node
/**
 * Sign in as test user, list jobs from the deployed app, and PATCH each with a schedule.
 * Uses BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD from env.
 *
 * Schedules applied by job name:
 *   "Daily digest"   -> cron 0 9 * * * (9:00 daily)
 *   "Weekly recap"   -> cron 0 9 * * 1 (9:00 Mondays)
 *   "Reminder check"-> recurring every 3600s (1 hour)
 *   "E2E test workflow" -> cron 0 10 * * * (10:00 daily)
 *
 * Usage:
 *   BASE_URL=https://cowork.ignitabull.org TEST_USER_EMAIL=... TEST_USER_PASSWORD=... node scripts/schedule-workflows.js
 */
const BASE_URL = (process.env.BASE_URL || 'https://cowork.ignitabull.org').replace(/\/$/, '');
const EMAIL = process.env.TEST_USER_EMAIL || 'autotest+e2e@coworktest.local';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

const SCHEDULES = {
  'Daily digest': { job_type: 'cron', cron_expression: '0 9 * * *' },
  'Weekly recap': { job_type: 'cron', cron_expression: '0 9 * * 1' },
  'Reminder check': { job_type: 'recurring', interval_seconds: 3600 },
  'E2E test workflow': { job_type: 'cron', cron_expression: '0 10 * * *' },
};

async function main() {
  const configRes = await fetch(`${BASE_URL}/api/config`);
  if (!configRes.ok) throw new Error('Failed to get config: ' + configRes.status);
  const config = await configRes.json();
  const supabaseUrl = (config.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = config.supabaseAnonKey || config.supabase_anon_key;
  if (!supabaseUrl || !anonKey) throw new Error('Config missing supabaseUrl or anon key');

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error('Sign-in failed: ' + tokenRes.status + ' ' + err);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('No access_token in sign-in response');

  const jobsRes = await fetch(`${BASE_URL}/api/jobs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!jobsRes.ok) throw new Error('GET /api/jobs failed: ' + jobsRes.status);
  const jobsData = await jobsRes.json();
  const jobs = jobsData.jobs || jobsData.data || jobsData;
  if (!Array.isArray(jobs)) throw new Error('Jobs response is not an array');

  const auth = { Authorization: `Bearer ${accessToken}` };
  let scheduled = 0;
  for (const job of jobs) {
    const schedule = SCHEDULES[job.name];
    if (!schedule) continue;
    const res = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    });
    if (!res.ok) {
      console.error('PATCH', job.name, 'failed:', res.status, await res.text());
      continue;
    }
    console.log('Scheduled:', job.name, '->', JSON.stringify(schedule));
    scheduled++;
  }
  console.log('Done. Scheduled', scheduled, 'workflow(s).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
