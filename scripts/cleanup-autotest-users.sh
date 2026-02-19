#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL in environment}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY in environment}"

PATTERN=${PATTERN:-"autotest+"}
KEEP_EMAIL=${KEEP_EMAIL:-"autotest+20260216-3@coworktest.local"}

USERS_JSON=$(curl -sS -G "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "Found users matching pattern '${PATTERN}' (keeping '${KEEP_EMAIL}')..."
echo "${USERS_JSON}" | jq -r --arg pattern "$PATTERN" --arg keep "$KEEP_EMAIL" \
  '.users[] | select(.email | contains($pattern)) | select(.email != $keep) | .id + "\t" + .email'

while IFS=$'\t' read -r user_id email; do
  if [[ -z "${user_id}" ]]; then
    continue
  fi
  echo "Deleting user ${email} (${user_id})"
  curl -sS -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${user_id}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" > /dev/null
  echo "Deleted ${user_id}"
done < <(echo "${USERS_JSON}" | jq -r --arg pattern "$PATTERN" --arg keep "$KEEP_EMAIL" \
  '.users[] | select(.email | contains($pattern)) | select(.email != $keep) | .id + "\t" + .email')

echo "Done."
