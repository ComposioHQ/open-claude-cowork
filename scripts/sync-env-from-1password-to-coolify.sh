#!/usr/bin/env bash
# Sync Open Claude Cowork env vars from 1Password to Coolify.
# Delegates to the Node script for consistent JSON and API handling.
#
# Usage: set ONEPASSWORD_VAULT, ONEPASSWORD_ITEM, COOLIFY_BASE_URL,
#        COOLIFY_API_TOKEN (or COOLIFY_API_TOKEN_REF), COOLIFY_APP_UUID,
#        then run:
#   ./scripts/sync-env-from-1password-to-coolify.sh
# Or: npm run sync:env:coolify
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/sync-env-from-1password-to-coolify.js" "$@"
