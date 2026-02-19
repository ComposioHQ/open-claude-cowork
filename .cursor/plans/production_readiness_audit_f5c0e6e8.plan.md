---
name: Production Readiness Audit
overview: Comprehensive production readiness audit of Open Claude Cowork covering security vulnerabilities, UI issues, incomplete features, configuration gaps, and missing infrastructure -- organized into prioritized fix categories.
todos:
  - id: tier1-security
    content: "Fix security vulnerabilities: error leaking, mass-assignment, XSS (6+ locations), SRI hashes, CSP, auth token storage, webhook headers, API key permissions"
    status: pending
  - id: tier2-backend
    content: "Backend hardening: rate limiting, SIGTERM, unbounded Map, 404 handler, sync I/O caching, JWT local verification, embeddings retry, response body drain, input validation"
    status: pending
  - id: tier3-ui
    content: "UI/UX fixes: mobile sidebar, dark mode, permission dialog theme, heartbeat interval leak, db-explorer stale flag, token expiry, smoke test failures"
    status: pending
  - id: tier4-config
    content: "Config and build: Electron packaging, CI/CD pipeline, .gitignore, anonymous default, Dockerfile, hardcoded paths, vitest alignment, pin dependencies"
    status: pending
  - id: tier5-clawd
    content: "Clawd fixes: SDK version alignment, basic tests, hardcoded path, config format, browser default"
    status: pending
isProject: false
---

# Production Readiness Audit Plan

This plan covers all identified issues across security, frontend, backend, testing, configuration, and deployment -- organized by priority tier.

---

## Tier 1: Security Vulnerabilities (Fix First)

### 1a. Server-side error message leaking

- ~40 `catch` blocks in `[server/server.js](server/server.js)` return `err.message` directly to the client, exposing internal table names, query structures, and stack frames.
- **Fix:** Replace all `res.status(500).json({ error: err.message })` with a generic `{ error: 'Internal server error' }` and log the real error server-side. Add a global Express error handler middleware as the last middleware.

### 1b. `updateProfile` mass-assignment vulnerability

- `[server/supabase/chat-store.js](server/supabase/chat-store.js)` `updateProfile()` passes the entire `req.body` to Supabase `.update(updates)`, allowing arbitrary column writes (e.g., `role`, `is_admin`).
- **Fix:** Allowlist only safe fields (`display_name`, `avatar_url`, etc.).

### 1c. `updateReportResult` missing user scope

- `[server/supabase/report-store.js](server/supabase/report-store.js)` updates reports by ID without a `user_id` filter, bypassing RLS via the admin client.
- **Fix:** Add `userId` parameter and `.eq('user_id', userId)` filter.

### 1d. XSS vulnerabilities in renderer

- **Vault picker** (`[renderer/renderer.js](renderer/renderer.js)`) -- `asset.id` and `asset.source` injected into HTML attributes without escaping.
- **TodoWrite render** -- `todo.status` injected into class attribute unescaped.
- **MCP settings list** -- `detail` string (composed from user-configured URLs/commands) not escaped.
- `**sanitizeHtml()` fallback** -- Returns raw HTML when DOMPurify fails to load.
- **Model dropdowns** -- `model.label`, `model.desc`, `model.value` not escaped.
- **Fix:** Apply `escapeHtml()` consistently to all dynamic values in `innerHTML` templates. Make `sanitizeHtml()` strip all tags as fallback when DOMPurify is unavailable.

### 1e. CDN scripts without Subresource Integrity

- `[renderer/index.html](renderer/index.html)` loads `marked`, `chart.js`, `DOMPurify`, and `supabase-js` from jsdelivr without `integrity` or `crossorigin` attributes. `marked` is also unpinned (no version).
- **Fix:** Pin all CDN versions and add SRI hashes.

### 1f. Auth token on `window` global

- `[renderer/auth.js](renderer/auth.js)` and `[renderer/web-api.js](renderer/web-api.js)` store the JWT as `window._authToken`, accessible to any script including XSS payloads.
- **Fix:** Move token into a closure variable, only accessible through the API facade.

### 1g. API key plaintext storage

- `[server/server.js](server/server.js)` writes API keys as plaintext JSON to `user-settings.json`. No file permissions set.
- **Fix:** At minimum, set `0600` file permissions on the settings file.

### 1h. Webhook header injection

- `[server/job-scheduler.js](server/job-scheduler.js)` spreads user-supplied `config.headers` into fetch requests.
- **Fix:** Blocklist security-sensitive headers (`Host`, `Authorization`, `Cookie`).

### 1i. Missing Content Security Policy

- No CSP meta tag in `[renderer/index.html](renderer/index.html)`.
- **Fix:** Add `<meta http-equiv="Content-Security-Policy">` restricting `script-src`, `style-src`, `connect-src`.

---

## Tier 2: Backend Production Hardening

### 2a. No rate limiting

- Zero rate limiting on any endpoint. Attacker can flood `/api/chat` (causing massive API costs) or auth endpoints.
- **Fix:** Add `express-rate-limit` on `/api/chat`, `/api/search`, `/api/upload`, auth endpoints.

### 2b. No graceful SIGTERM shutdown

- Only `SIGINT` is handled. Docker/K8s send `SIGTERM`. Scheduler's `pollTimer` and SSE connections are not drained.
- **Fix:** Handle `SIGTERM` identically to `SIGINT`. Call `stopScheduler()`. Add a forced-exit timeout.

### 2c. `composioSessions` unbounded Map

- New entry per unique `userId` with no eviction or TTL -- memory leak.
- **Fix:** Use `lru-cache` with max size and TTL.

### 2d. Missing API 404 handler

- Undefined `/api/*` routes fall through to static file serving or Express's default HTML 404.
- **Fix:** Add `app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))` before static middleware.

### 2e. Synchronous file I/O on every request

- `readUserSettingsFile()` does sync `fs.readFileSync` on every chat request. `plugin-manager.js` `discover()` also does sync I/O on every chat.
- **Fix:** Cache parsed settings and plugin discovery with a short TTL.

### 2f. Auth middleware per-request remote validation

- Every request calls `admin.auth.getUser(token)` round-trip to Supabase.
- **Fix:** Use local JWT verification with the Supabase JWT secret for most requests.

### 2g. Embeddings API no retry/backoff

- `[server/supabase/embeddings.js](server/supabase/embeddings.js)` makes OpenAI API calls with no rate limiting or exponential backoff.
- **Fix:** Add retry with exponential backoff and respect `Retry-After` headers.

### 2h. Webhook response body never consumed

- `[server/job-scheduler.js](server/job-scheduler.js)` `fetch()` result body is never drained, causing connection leaks.
- **Fix:** Add `await resp.text()` or `resp.body?.cancel()`.

### 2i. `chatId` / `ilike` input validation

- No UUID format validation on `chatId` from client. LIKE wildcards (`%`, `_`) in task search not escaped.
- **Fix:** Validate UUID format. Escape LIKE special characters.

---

## Tier 3: UI/UX Issues

### 3a. No mobile layout for left sidebar

- Right sidebar has a mobile breakpoint; left sidebar (260px) does not, consuming ~50% of mobile viewport.
- **Fix:** Add `@media (max-width: 768px)` for `.left-sidebar` -- either auto-collapse or convert to overlay.

### 3b. No dark mode support

- Hardcoded light cream theme. No `prefers-color-scheme: dark` query or toggle.
- **Fix:** Add CSS custom properties for colors and a dark mode media query (or manual toggle).

### 3c. Permission dialog theme conflict

- Dark dialog background uses CSS variables that fall back to light theme text colors, making text invisible.
- **Fix:** Scope dark color overrides to `.permission-dialog` descendants.

### 3d. `heartbeatChecker` interval leak

- `setInterval` from streaming is never cleared when starting a new chat.
- **Fix:** Call `clearInterval(heartbeatChecker)` in `startNewChat()`.

### 3e. `db-explorer.js` stale load flag

- `loaded = true` is set before the async load completes. A failed load permanently prevents retry.
- **Fix:** Set `loaded = true` after successful load, add `reload()` method.

### 3f. No token expiry handling in web mode

- `[renderer/web-api.js](renderer/web-api.js)` sends potentially expired tokens with no 401 retry logic.
- **Fix:** Add token expiry check or 401 response interception with refresh.

### 3g. Smoke test failures indicate real bugs

- 75% pass rate with failures in: sidebar animation, vault view timeout, thinking mode toggle state, responsive viewports, keyboard navigation.
- **Fix:** Address the underlying UI bugs causing these failures.

---

## Tier 4: Configuration and Build

### 4a. No Electron packaging

- No `electron-builder`, `electron-forge`, or packaging config. No app icon, no code signing, no auto-updater, no installer. App can only run from source.
- **Fix:** Configure `electron-builder` with basic targets (DMG for macOS, NSIS for Windows, AppImage for Linux).

### 4b. No CI/CD pipeline

- No `.github/workflows/` directory despite templates in test docs.
- **Fix:** Create workflows for: unit tests, smoke tests, and (eventually) Electron build + Docker image.

### 4c. `.gitignore` gaps

- `playwright-report/`, `test-results/`, `output/` are untracked but not ignored.
- **Fix:** Add these to `.gitignore`.

### 4d. `ALLOW_ANONYMOUS=true` default

- Hardcoded in both `.env.example` and `Dockerfile`. Production deploys will have open unauthenticated access.
- **Fix:** Default to `false` in Dockerfile; add a comment in `.env.example` that this is for dev only.

### 4e. Dockerfile gaps

- Missing `ANTHROPIC_API_KEY` and `COMPOSIO_API_KEY` env declarations. No `HEALTHCHECK`. No `.dockerignore`.
- **Fix:** Add missing env vars, health check, and `.dockerignore`.

### 4f. Hardcoded paths in scripts

- `[scripts/playwright-full-smoke.js](scripts/playwright-full-smoke.js)` has a developer-specific absolute path as fallback. Port mismatch (3002 vs 3001).
- **Fix:** Use `path.join(__dirname, '..', 'output', 'playwright')`. Unify port default.

### 4g. Vitest config / docs mismatch

- Coverage excludes `renderer/` despite docs claiming otherwise. Docs say `happy-dom` environment, config uses `node`. Missing `.env.test`.
- **Fix:** Align docs with reality or fix the config. Create a `.env.test` template.

### 4h. Non-reproducible dependencies

- `@composio/core: "latest"` and `@opencode-ai/sdk: "latest"` in dependencies.
- **Fix:** Pin to specific semver ranges.

---

## Tier 5: Clawd Subsystem

### 5a. SDK version mismatch

- Root uses `@anthropic-ai/claude-agent-sdk: ^0.2.7`, Clawd uses `^0.1.0` (non-overlapping pre-1.0 ranges).
- **Fix:** Update Clawd to `^0.2.7`.

### 5b. Zero test coverage

- 845-line CLI, 457-line agent, 4 platform adapters, browser server -- all untested.
- **Fix:** At minimum, add unit tests for `base.js` `shouldRespond()` and `claude-agent.js` core logic.

### 5c. Hardcoded developer path in system prompt

- `[clawd/agent/claude-agent.js](clawd/agent/claude-agent.js)` contains `~/Desktop/santa-wrapped/open-claude-cowork/clawd`.
- **Fix:** Use `__dirname` or a config value.

### 5d. Regex-based config mutation

- `[clawd/cli.js](clawd/cli.js)` modifies `config.js` via fragile regex replacement that breaks on nested objects or comments.
- **Fix:** Migrate to JSON/YAML config file format.

### 5e. Browser enabled by default with `headless: false`

- `[clawd/config.js](clawd/config.js)` defaults to visible browser window for all new users.
- **Fix:** Default `enabled: false`.

---

## Recommended Execution Order

1. **Tier 1** (Security) -- these are exploitable vulnerabilities
2. **Tier 2** (Backend hardening) -- prevents DoS, resource leaks, and operational failures
3. **Tier 3** (UI/UX) -- user-facing quality issues
4. **Tier 4** (Config/Build) -- infrastructure needed for actual production deployment
5. **Tier 5** (Clawd) -- separate subsystem, lower blast radius

