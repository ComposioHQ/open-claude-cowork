#!/usr/bin/env node

const BASE_URL = (process.argv[2] || process.env.DEPLOY_SMOKE_URL || process.env.BASE_URL || 'https://cowork.ignitabull.org').replace(/\/$/, '');

const checks = [];
const issues = [];

function addResult(name, passed, details) {
  checks.push({ name, passed, details });
}

function addIssue(severity, area, issue, evidence) {
  issues.push({ severity, area, issue, evidence });
}

async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      ...options
    });
    const body = await response.text();
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch (_) {
      // non-json responses are expected for some endpoints
    }
    return { response, body, json, ok: response.ok };
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
}

function short(obj, max = 200) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function maskSecret(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (str.length <= 10) return '*'.repeat(str.length);
  return `${str.slice(0, 6)}...${str.slice(-4)} (${str.length} chars)`;
}

function ensure(condition, name, details) {
  addResult(name, !!condition, details);
  if (!condition) {
    addIssue('high', name, details, 'Assertion failed');
  }
}

async function checkPublicConfig(baseCheck = true) {
  const configUrl = `${BASE_URL}/api/config`;
  const configResult = await request(configUrl);
  const ok = configResult.response.status === 200;
  addResult('Public config endpoint', ok, `${configUrl} -> ${configResult.response.status}`);

  if (!ok) {
    addIssue('high', 'api/config', 'Config endpoint is not reachable', configResult.body || configResult.response.statusText);
    return null;
  }

  const hasSupabaseUrl = !!(configResult.json && typeof configResult.json.supabaseUrl === 'string' && configResult.json.supabaseUrl.trim());
  const hasAnonKey = !!(configResult.json && typeof configResult.json.supabaseAnonKey === 'string' && configResult.json.supabaseAnonKey.trim());

  if (baseCheck) {
    ensure(
      hasSupabaseUrl,
      'Config includes supabaseUrl',
      `supabaseUrl set=${hasSupabaseUrl}`
    );
    ensure(
      hasAnonKey,
      'Config includes supabaseAnonKey',
      `supabaseAnonKey set=${hasAnonKey}`
    );
  }

  return configResult.json;
}

async function checkSupabaseAnonKey(config) {
  if (!config) {
    addIssue('high', 'Supabase auth', 'Skipping anon key verification; /api/config invalid', 'No config object available');
    addResult('Supabase anon key health check', false, 'Skipped');
    return;
  }

  const supabaseUrl = (config.supabaseUrl || '').trim().replace(/\/$/, '');
  const anonKey = (config.supabaseAnonKey || '').trim();

  if (!supabaseUrl || !anonKey) {
    addIssue(
      'high',
      'Supabase env values',
      'Missing supabaseUrl or supabaseAnonKey in config',
      `supabaseUrl set=${!!supabaseUrl} supabaseAnonKey=${anonKey ? maskSecret(anonKey) : 'missing'}`
    );
    addResult('Supabase anon key health check', false, 'Missing URL/key');
    return;
  }

  const healthUrl = `${supabaseUrl}/auth/v1/health`;
  const supabaseRes = await request(healthUrl, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      'x-client-info': 'open-claude-cowork-deploy-smoke'
    }
  });
  const status = supabaseRes.response.status;

  if (status === 200) {
    addResult('Supabase anon key health check', true, `${healthUrl} -> 200`);
    return;
  }

  addResult('Supabase anon key health check', false, `${healthUrl} -> ${status} ${supabaseRes.body}`);
  addIssue('high', 'Supabase anon key', 'Supabase anon key is invalid in deployed environment', `${status} ${short(supabaseRes.body, 220)}`);
}

async function checkRoute(method, path, expectedStatus) {
  const url = `${BASE_URL}${path}`;
  const result = await request(url, { method });
  const status = result.response.status;
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const pass = expectedStatuses.includes(status);
  const expectedSummary = expectedStatuses.join(' or ');

  if (pass) {
    addResult(`${method} ${path}`, true, `status=${status}`);
    return;
  }

  addResult(`${method} ${path}`, false, `status=${status}`);
  addIssue('medium', 'Route contract', `Expected ${expectedSummary} for ${method} ${path}`, `received ${status}`);
}

async function main() {
  console.log(`Running deploy smoke check for: ${BASE_URL}`);

  const rootResp = await request(BASE_URL, { method: 'GET' });
  addResult('Home page loads', rootResp.response.status === 200, `${BASE_URL} -> ${rootResp.response.status}`);
  if (rootResp.response.status !== 200) {
    addIssue('high', 'Home page', 'Cannot load app homepage', rootResp.body || rootResp.response.statusText);
  }

  const healthResp = await request(`${BASE_URL}/api/health`);
  const healthOk = healthResp.response.status === 200;
  addResult('Health endpoint', healthOk, `${BASE_URL}/api/health -> ${healthResp.response.status}`);
  if (healthOk && healthResp.json) {
    if (!Array.isArray(healthResp.json.providers) || healthResp.json.providers.length === 0) {
      addIssue('medium', 'Health payload', 'providers array missing or empty', JSON.stringify(healthResp.json));
    }
  }

  const config = await checkPublicConfig();

  await checkSupabaseAnonKey(config);

  await checkRoute('GET', '/api/providers', 200);

  const authProtectedRoutes = [
    { method: 'GET', path: '/api/chats' },
    { method: 'POST', path: '/api/chat' },
    { method: 'GET', path: '/api/settings' },
    { method: 'POST', path: '/api/messages' },
    { method: 'POST', path: '/api/vault/folders' },
    { method: 'GET', path: '/api/vault/folders' },
    { method: 'GET', path: '/api/jobs' },
    { method: 'GET', path: '/api/plugins' },
    { method: 'POST', path: '/api/upload' },
    { method: 'POST', path: '/api/search' }
  ];

  for (const { method, path } of authProtectedRoutes) {
    await checkRoute(method, path, 401);
  }

  const knownMissingRoutes = [
    { method: 'GET', path: '/api/search', expected: [404] },
    { method: 'GET', path: '/api/reports', expected: [404] }
  ];

  for (const { method, path, expected } of knownMissingRoutes) {
    await checkRoute(method, path, expected);
  }

  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.passed).length;
  const highIssues = issues.filter((i) => i.severity === 'high').length;
  const mediumIssues = issues.filter((i) => i.severity === 'medium').length;

  const summary = {
    baseUrl: BASE_URL,
    timestamp: new Date().toISOString(),
    checks,
    issues,
    totals: {
      totalChecks,
      passedChecks,
      highIssues,
      mediumIssues
    }
  };

  console.log(JSON.stringify(summary, null, 2));

  process.exitCode = issues.length > 0 ? 1 : 0;
}

main().catch((err) => {
  addIssue('high', 'Runner', 'Unexpected error', err?.message || String(err));
  console.error(err);
  process.exit(1);
});
