#!/usr/bin/env node
/**
 * Sync env vars from 1Password to Coolify.
 *
 * Mode 1 — Single item: set ONEPASSWORD_VAULT and ONEPASSWORD_ITEM; item must have
 * fields named exactly as env keys (ANTHROPIC_API_KEY, COMPOSIO_API_KEY, etc.).
 *
 * Mode 2 — Auto (APIs vault): omit vault/item; script uses known 1Password refs for
 * APIs vault (Anthropic API, Composio API, Supabase API, OpenAI API, Coolify2 API).
 * Set only COOLIFY_APP_UUID (or leave unset to use open-claude-cowork app on Coolify2).
 *
 * Required env (mode 1): ONEPASSWORD_VAULT, ONEPASSWORD_ITEM, COOLIFY_BASE_URL,
 *   COOLIFY_API_TOKEN, COOLIFY_APP_UUID
 * Optional: COOLIFY_API_TOKEN_REF=op://Vault/Item/field
 * Required env (mode 2): none (COOLIFY_APP_UUID optional; defaults to open-claude-cowork uuid)
 */
const { execFileSync } = require('child_process');

const VAULT_APIS = 'APIs';

// Mode 2: op ref -> env key (separate items in APIs vault)
const REF_MAP = [
  ['op://APIs/Anthropic API/credential', 'ANTHROPIC_API_KEY'],
  ['op://APIs/Composio API/credential', 'COMPOSIO_API_KEY'],
  ['op://APIs/OpenAI API/credential', 'OPENAI_API_KEY'],
  ['op://APIs/Supabase API/hostname', 'SUPABASE_URL'],
  ['op://APIs/Supabase API/supabase_publishable_anon_key', 'SUPABASE_ANON_KEY'],
  ['op://APIs/Supabase API/credential', 'SUPABASE_ANON_KEY'],
  ['op://APIs/Supabase API/service_role_key', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['op://Erin/Smithery API/credential', 'SMITHERY_API_KEY'],
];

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
  const vault = process.env.ONEPASSWORD_VAULT;
  const item = process.env.ONEPASSWORD_ITEM;
  let coolifyBaseUrl = process.env.COOLIFY_BASE_URL;
  let coolifyToken = process.env.COOLIFY_API_TOKEN;
  const coolifyTokenRef = process.env.COOLIFY_API_TOKEN_REF;
  let appUuid = process.env.COOLIFY_APP_UUID;

  const useAuto = !vault && !item;

  if (useAuto) {
    coolifyBaseUrl = opRead('op://APIs/Coolify2 API/url');
    coolifyToken = opRead('op://APIs/Coolify2 API/credential');
    if (!appUuid) appUuid = OPEN_CLAUDE_COWORK_UUID;
  } else if (coolifyTokenRef) {
    coolifyToken = opRead(coolifyTokenRef);
  }

  if (!coolifyBaseUrl || !coolifyToken || !appUuid) {
    console.error(useAuto
      ? 'Auto mode: could not read Coolify2 API (url, credential) from 1Password.'
      : 'Missing required env: ONEPASSWORD_VAULT, ONEPASSWORD_ITEM, COOLIFY_BASE_URL, COOLIFY_API_TOKEN (or COOLIFY_API_TOKEN_REF), COOLIFY_APP_UUID');
    process.exit(1);
  }

  coolifyBaseUrl = coolifyBaseUrl.replace(/\/$/, '');
  const data = [];

  if (useAuto) {
    const seenKeys = new Set();
    for (const [ref, key] of REF_MAP) {
      const value = opRead(ref);
      if (value != null && value !== '' && !seenKeys.has(key)) {
        data.push({ key, value, is_literal: true });
        seenKeys.add(key);
      }
    }
  } else {
    const KEYS = [
      'ANTHROPIC_API_KEY', 'COMPOSIO_API_KEY', 'SMITHERY_API_KEY',
      'DATAFORSEO_USERNAME', 'DATAFORSEO_PASSWORD', 'SUPABASE_URL',
      'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY',
      'ALLOW_ANONYMOUS', 'ADMIN_EMAILS', 'CORS_ORIGINS',
    ];
    for (const key of KEYS) {
      const value = opRead(`op://${vault}/${item}/${key}`);
      if (value != null && value !== '') {
        data.push({ key, value, is_literal: true });
      }
    }
  }

  if (data.length === 0) {
    console.error(useAuto
      ? 'Auto mode: no values read. Check 1Password APIs vault (Anthropic API, Composio API, Supabase API, OpenAI API).'
      : 'No values read from 1Password. Ensure the item has fields named like ANTHROPIC_API_KEY, COMPOSIO_API_KEY, etc.');
    process.exit(1);
  }

  const url = `${coolifyBaseUrl}/api/v1/applications/${appUuid}/envs/bulk`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${coolifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Coolify API error (HTTP ${res.status}):`, body);
      process.exit(1);
    }
    console.log(`Done. ${data.length} environment variables updated in Coolify.`);
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
