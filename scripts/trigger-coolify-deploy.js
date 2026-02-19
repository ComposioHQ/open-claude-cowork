#!/usr/bin/env node
/**
 * Trigger a Coolify deployment for the open-claude-cowork application.
 * Uses COOLIFY_BASE_URL, COOLIFY_API_TOKEN, COOLIFY_APP_UUID from env, or 1Password (op run).
 *
 * Usage:
 *   node scripts/trigger-coolify-deploy.js
 *   op run --env-file=.env -- node scripts/trigger-coolify-deploy.js
 *   COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=... COOLIFY_APP_UUID=... node scripts/trigger-coolify-deploy.js
 */
const { execFileSync } = require('child_process');

const OPEN_CLAUDE_COWORK_UUID = 'y4wkoooowsw040g80gwwogkw';

function opRead(ref) {
  try {
    const out = execFileSync('op', ['read', ref], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.trim();
  } catch {
    return null;
  }
}

async function main() {
  let baseUrl = process.env.COOLIFY_BASE_URL;
  let token = process.env.COOLIFY_API_TOKEN;
  let appUuid = process.env.COOLIFY_APP_UUID;

  if (!baseUrl || !token) {
    baseUrl = baseUrl || opRead('op://APIs/Coolify2 API/url');
    token = token || opRead('op://APIs/Coolify2 API/credential');
  }
  if (!appUuid) appUuid = OPEN_CLAUDE_COWORK_UUID;

  if (!baseUrl || !token) {
    console.error('Set COOLIFY_BASE_URL and COOLIFY_API_TOKEN, or run with: op run -- node scripts/trigger-coolify-deploy.js');
    process.exit(1);
  }

  baseUrl = baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/deploy?uuid=${appUuid}`;
  console.log('Triggering deploy:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Deploy trigger failed:', res.status, text);
    process.exit(1);
  }
  console.log('Deploy triggered successfully.');
  try {
    const json = JSON.parse(text);
    if (json.deployments && json.deployments[0]) {
      const d = json.deployments[0];
      if (d.deployment_uuid) console.log('Deployment UUID:', d.deployment_uuid);
      if (d.message) console.log('Message:', d.message);
    }
  } catch (_) {}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
