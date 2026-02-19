# Repository Deep-Dive Punch List

**Generated:** 2026-02-15

## Fixed / Verified

- [x] **Task-label writes are user-scoped** (`server/supabase/task-store.js`, `server/server.js`)
  - `assignLabel` and `removeLabel` now validate ownership for both task and label before mutating relation rows.
  - Routes now pass `req.user.id` through to store methods.

- [x] **Webhook egress hardening for scheduler jobs** (`server/job-scheduler.js`)
  - Added URL validation for webhook jobs: protocol allowlist, DNS/hostname allowlist support, private-network blocking, and no localhost/private IP hops.
  - Host allowlist driven by `WEBHOOK_HOST_ALLOWLIST`.

- [x] **Scheduler duplicate execution reduced** (`server/job-scheduler.js`, `server/supabase/job-store.js`)
  - Added `claimDueJob(...)` optimistic update on `next_run_at` and a startup/recovery path (`recoverStaleRunningJobs`).
  - Poll loop now only executes successfully claimed rows.

- [x] **Plugin install/enable trust surface narrowed** (`server/plugins/plugin-manager.js`, `server/server.js`)
  - URL/path hardening for git installs.
  - Git host allowlist + blocked localhost/private hosts.
  - MCP config from plugins is sanitized (only allowlisted commands or sanitized HTTP URLs/headers).
  - Plugin install/enable/disable/remove endpoints now require `requireAdmin`.
  - Plugin MCP local execution now requires explicit opt-in via `PLUGIN_ALLOW_LOCAL_MCP=true`.
  - Plugin MCP URL parsing now handles malformed URL values without crashing and rejects non-HTTP(S) schemes.

- [x] **CORS null-origin behavior reduced** (`server/server.js`)
  - `file://` and missing Origin requests now blocked by default in non-test mode.
  - Explicitly configurable with `ALLOW_NULL_ORIGIN=true`.

- [x] **Anonymous session key collision reduced** (`server/server.js`, `server/providers/base-provider.js`)
  - Anonymous identities are now scoped with `anonymous:<ip+ua hash>`
  - Session and abort flows now use actor user id consistently.

- [x] **Anonymous identity scoping is consistently applied to all authenticated routes** (`server/supabase/auth-middleware.js`)
  - `requireAuth` now emits deterministic `anonymous:<hash>` IDs when `ALLOW_ANONYMOUS=true`.
  - Added support for explicit `x-anon-session-id` override for stable session binding across related requests.
  - This closes the remaining anonymous namespace collision surface in route handlers that still used `req.user.id` directly.
  - Added regression tests for anonymous ID format and explicit session override.

- [x] **Embedding pipeline overlap mitigation** (`server/supabase/embeddings.js`)
  - Added in-process re-entrancy guard to prevent concurrent `processUnembeddedMessages()` runs.

- [x] **Provider/chat ownership and ownership-aware persistence** (`server/providers/base-provider.js`, `server/supabase/chat-store.js`, `server/server.js`)
  - Permission/abort/abort-flow validation tightened; ownership checks in chat write paths made explicit.


- [x] **Plugin-supplied local MCP execution is opt-in only** (`server/plugins/plugin-manager.js`)
  - Fixed by requiring explicit operator opt-in (`PLUGIN_ALLOW_LOCAL_MCP=true`) before allowing local MCP command definitions.
- [x] **Cron parser is now feature-complete for local scheduling fields** (`server/job-scheduler.js`)
  - Added support for `?`, `L`, `L-n`, `W`, `#`, and step/range tokens with day-of-month/day-of-week matching logic.
  - Exported `getNextCronRun` for dedicated unit coverage.
- [x] **Anonymous session correlation header is CORS-whitelisted** (`server/server.js`)
  - Added `x-anon-session-id` to `allowedHeaders` so explicit anonymous-session IDs can be sent from browser clients.
- [x] **Documentation drift corrected** (`CLAUDE.md`)
  - Updated test/run status and anonymous auth explanation to match current behavior (`anonymous:<session-key>`) and local fallback.
- [x] **Chat-message scheduled jobs execute via provider stack** (`server/job-scheduler.js`)
  - Implemented actual provider query execution for `chat_message` jobs and persisted assistant response payloads in execution results.
  - Added provider integration tests (including provider dispatch and response capture).
- [x] **Data-export format branch is now applied** (`server/job-scheduler.js`)
  - Exported `format` now affects scheduler output:
    - `json` emits compact JSON text
    - `csv` emits CSV text with headers and row serialization
  - Unknown formats now fail fast with `Unsupported data_export format`.
  - Added regression coverage for CSV/JSON output and invalid-format failure.

## Remaining / Still Open

- None currently.

## Re-scan (2026-02-15)

- Re-ran a full repository pass after the additional features:
  - Confirmed scheduler placeholders are now implemented for `chat_message` and `data_export` format handling.
  - Added regression coverage for provider-backed `chat_message` execution and export serialization.

## Re-scan Follow-up (2026-02-15)

- [x] **Job payload normalization and legacy alias support** (`server/supabase/job-store.js`)
  - Fixed contract drift by accepting both camelCase and snake_case job payload keys on create/update:
    - `jobType`/`job_type`
    - `actionType`/`action_type`
    - `executeAt`/`execute_at`, `intervalSeconds`/`interval_seconds`, `cronExpression`/`cron_expression`, `nextRunAt`/`next_run_at`, `runCount`/`run_count`, `lastError`/`last_error`, `lastRunAt`/`last_run_at`
  - Added normalization for legacy values:
    - `jobType` `"once"` -> `"one_time"`
    - `jobType` `"interval"` -> `"recurring"`
    - `actionType` `"report"` -> `"report_generation"`
  - Updated integration tests to use canonical job/action names (`one_time`, `recurring`, `report_generation`) where user-facing payloads are validated, and added unit coverage for the legacy/snake_case normalization behavior.
- [x] **Data-export source mapping parity** (`renderer/index.html`, `renderer/renderer.js`, `server/job-scheduler.js`, `tests/unit/server/job-scheduler.test.js`)
  - Aligns scheduler and UI so export source values are explicit:
    - UI now offers `messages` and `providers` directly.
    - Legacy `chats` is normalized to `messages` in scheduler runtime and form hydration.
    - Legacy `provider_usage` is normalized to `providers`.
  - Added regression coverage for legacy alias handling and unsupported source failures in the scheduler unit suite.
- [x] **Scheduled Jobs UI now supports `chat_message` action** (`renderer/index.html`, `renderer/renderer.js`)
  - Added first-class UI fields to create/edit chat-message scheduled jobs:
    - Prompt (required)
    - Provider override
    - Optional max turns
  - Wired config hydration for existing chat_message jobs and save-time payload validation to avoid empty prompts.
  - This closes the UI parity gap with backend scheduler support.
- [x] **`chat_message` job save flow no longer throws when prompt is missing** (`renderer/renderer.js`)
  - Fixed a runtime TDZ by moving `jobSaveBtn` lookup before chat-message validation branch.
  - Prevents intermittent `ReferenceError` when users attempt to save a chat action with an empty prompt.

## Re-scan (Punch List Sanity) (2026-02-15)

- Re-ran sweep for TODOs/TBDs and executed full `npm test`; no additional unfinished features found.
- Remaining items are still clear.

## Re-scan (Post UI Completion) (2026-02-15)

- Performed a full repository grep/sweep plus test pass; no additional unfinished placeholders were identified.
