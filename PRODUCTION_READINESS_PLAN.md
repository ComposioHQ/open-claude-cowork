# Production Readiness Analysis Plan

This document outlines a structured plan to analyze **Open Claude Cowork** for production readiness: UI issues, incomplete features, wrong code, missing pieces, and general hardening.

---

## 1. Scope Summary

| Area | Scope |
|------|--------|
| **Desktop app** | Electron main/preload + renderer (vanilla JS) |
| **Backend** | Express server (ESM), Supabase, providers, MCP, plugins |
| **Clawd** | Messaging bot (separate entry point; optional for “desktop app” production) |
| **Tests** | Vitest (unit + integration) + Playwright E2E |

The plan is ordered by priority and dependency where it matters.

---

## 2. Known Issues to Verify First

These were spotted during exploration; confirm and fix as part of the analysis.

### 2.1 UI / Frontend bugs

- [x] **Folder instructions Save/Cancel IDs**
  - **Issue:** `renderer.js` originally used `getElementById('settingsFolderSaveBtn')` and `getElementById('settingsFolderCancelBtn')`, while `index.html` used `settingsFolderInstructionSaveBtn` / `settingsFolderInstructionCancelBtn`.
  - **Status:** Fixed. Handlers now correctly bind to the folder instruction IDs in both files.

### 2.2 Documentation vs reality

- [x] **CLAUDE.md** now documents the active test stack (`npm test` with Vitest) and current test commands.

---

## 3. Code Correctness & Wrong Code

### 3.1 Server

- [ ] **Error handling and status codes**
  - Audit all API routes for consistent error responses (shape, status codes, no leaking stack traces or secrets).
  - Ensure `shouldFailDbWrite` and chat-ownership checks are used consistently where applicable.
- [ ] **Async and resource cleanup**
  - Review streaming/SSE endpoints for proper cleanup on client disconnect and on errors (abort, timeouts, open handles).
  - Check provider `abort()` paths and that in-flight requests are actually cancelled.
- [ ] **Input validation**
  - Validate and sanitize all request bodies and query params (e.g. chatId, reportId, jobId, folderId, table names for DB explorer).
  - Ensure file upload (vault, attachments) has size limits, type checks, and safe storage paths.
- [ ] **Security**
  - Confirm no API keys or tokens are ever sent to the renderer in full (only masked).
  - Confirm `user-settings.json` and any key storage are not exposed via API or static serving.
  - Review CORS and origin checks; ensure production origins are explicit (no accidental `*` in prod).
  - Review rate limiting (e.g. `express-rate-limit`) scope and limits for production.

### 3.2 Renderer

- [ ] **Null safety**
  - All `getElementById` usages: ensure elements exist before use (especially in Settings and optional views). Fix folder-instruction IDs first, then scan for similar mismatches.
- [ ] **API error handling**
  - Ensure every `electronAPI`/`web-api` call has user-visible feedback on failure (toast, inline message, or banner) where appropriate.
- [ ] **XSS**
  - All markdown/HTML rendering (e.g. `marked` + DOMPurify): verify sanitization is applied and no `innerHTML` with raw user/API content without sanitization.

### 3.3 Preload / Electron

- [ ] **SERVER_URL**
  - Preload hardcodes `http://localhost:3001`. For packaged Electron app, document or make configurable (e.g. env or build-time) if backend URL can differ.
- [ ] **Context bridge**
  - Ensure only intended methods are exposed and no `nodeIntegration`/unsafe exposure in renderer.

---

## 4. UI / UX Issues

### 4.1 Layout and responsiveness

- [ ] **Window resize and small viewports**
  - Sidebars (left chat history, right progress/artifact): behavior when collapsed/expanded and on small windows.
  - Database explorer, Reports, Jobs, Vault: tables and grids on narrow screens.
- [ ] **High DPI / zoom**
  - Icons and text scaling; any fixed pixel sizes that break at 125%/150% zoom or non‑1x DPI.

### 4.2 Accessibility

- [ ] **Keyboard**
  - Tab order, focus trapping in modals (e.g. permission dialog, task modal, Settings), Escape to close.
  - Shortcuts (e.g. ⇧⌘E for thinking) documented and working.
- [ ] **Screen readers**
  - Critical buttons and regions have labels/roles; live regions for streaming messages and errors.
- [ ] **Color and contrast**
  - Text/background and interactive elements meet minimum contrast (e.g. WCAG AA).

### 4.3 States and feedback

- [ ] **Loading**
  - Every async view (chat load, DB explorer, reports, jobs, vault) shows clear loading state; no blank content without spinner or skeleton.
- [ ] **Empty states**
  - All lists (chats, reports, jobs, vault, tool calls, steps) have clear empty-state copy and, where relevant, a primary action.
- [ ] **Errors**
  - Network/backend errors and validation errors shown in UI (not only console); retry or recovery where applicable.
- [ ] **Backend down**
  - Banner (“Backend not running…”) is visible and dismissible; re-check on focus or periodically if needed.

### 4.4 Consistency

- [ ] **Copy and terminology**
  - Provider/model names, “Artifact”, “Vault”, “Reports”, “Jobs” consistent across sidebar, headers, and settings.
- [ ] **Buttons and forms**
  - Primary vs secondary actions; disabled state when submit is invalid; no double-submit.

---

## 5. Incomplete or Missing Features

### 5.1 Feature completeness (by view)

- [ ] **Auth**
  - Sign in / sign up / “Continue without account” flows; token refresh and expiry handling; sign out clears state and optionally local data.
- [ ] **Chat**
  - Send, stream, stop; attachments and vault attachments; thinking toggle; provider/model switch; session persistence and resume.
- [ ] **Right sidebar**
  - Progress (steps/todos), sub-agents, tool calls; Artifact panel (code vs doc editor, copy, download, undo/redo).
- [ ] **Settings**
  - Provider tokens, MCP servers, browser automation, instructions (global + folder), permissions, document output dir, plugins. Save/cancel and success/error feedback for each section.
- [ ] **Database explorer**
  - Tables list, schema/indexes/data tabs, search, pagination; admin-only access enforced server-side.
- [ ] **Reports**
  - Templates, custom builder, saved reports, run and display (chart/table); Supabase-gated “unavailable” state.
- [ ] **Jobs**
  - CRUD, schedule types, action types (report, webhook, export); list and run; Supabase-gated state.
- [ ] **Vault**
  - Folders, upload, list, filter/sort, breadcrumbs; Supabase-gated state.
### 5.2 Edge cases

- [ ] **Offline / flaky network**
  - Graceful degradation: queue or clear message when backend is unreachable; no infinite spinners.
- [ ] **Very long chats**
  - Performance (DOM size, scroll); optional virtualization or pagination of message history.
- [ ] **Large attachments / vault files**
  - Size limits, progress indicator for uploads, timeouts.

### 5.3 Configuration and deployment

- [ ] **Environment**
  - `.env.example` is up to date with all optional and required vars (Supabase, OpenAI, browser, ALLOW_ANONYMOUS, etc.).
  - Document which vars are required for “minimal” vs “full” (Supabase, reports, jobs, vault, DB explorer).
- [ ] **Docker**
  - Dockerfile and docs: which env vars to pass; health check; no Electron in container (web-only).
- [ ] **Electron packaging**
  - If you ship a packaged app: build script, notarization (macOS), code signing; correct SERVER_URL or config for packaged use.

---

## 6. Missing or Weak Areas

### 6.1 Testing

- [ ] **Coverage**
  - Run `npm run test:coverage` and list critical paths with no or low coverage (e.g. chat stream, permission flow, vault upload, report run).
- [ ] **Integration**
  - Key flows covered: auth, chat send/stream, settings load/save, reports/jobs/vault CRUD where applicable.
- [x] **E2E**
  - Playwright E2E is already in scope via `tests/smoke.spec.js`, `tests/critical-user-journeys.spec.js`, and `npm run test:e2e*` scripts.

### 6.2 Observability and operations

- [ ] **Logging**
  - Structured logs for errors and key actions (auth, chat start/stop, job run); no secrets in logs.
- [ ] **Health**
  - `/api/health` exists; consider readiness (e.g. Supabase/Composio reachable) if needed for orchestration.
- [ ] **Graceful shutdown**
  - Server closes SSE and in-flight requests cleanly on SIGTERM/SIGINT.

### 6.3 Dependencies and maintenance

- [ ] **Vulnerabilities**
  - `npm audit` (root and `server/`, and `clawd/` if part of release); fix or document accepted risks.
- [ ] **Pinned versions**
  - Prefer exact or ranged versions in package.json for reproducible builds; lockfile committed.
- [ ] **CDN scripts (renderer)**
  - `marked`, Chart.js, DOMPurify, Supabase: consider integrity hashes (SRI) or bundling for production.

---

## 7. Suggested Order of Execution

1. **Quick wins**
   - [x] Fix folder-instruction button IDs (Section 2.1).
   - [x] Update CLAUDE.md about Vitest (Section 2.2).
2. **Correctness**
   - Server error handling and input validation (Section 3.1); renderer null-safety and API errors (Section 3.2); preload/Electron (Section 3.3).
3. **Security**
   - Keys/tokens never to renderer; CORS; rate limit; file upload and DB explorer validation (Section 3.1).
4. **UI/UX**
   - Loading, empty, and error states (Section 4.3); then accessibility and responsiveness (Sections 4.1–4.2).
5. **Feature completeness**
   - Go view-by-view (Section 5.1); then edge cases and config (Sections 5.2–5.3).
6. **Testing and ops**
   - Coverage and integration (Section 6.1); logging and health (Section 6.2); deps and CDN (Section 6.3).

---

## 8. Outputs of the Analysis

Recommended outputs so the work is trackable:

- **Checklist**
  - Copy this plan into issues or a tracking doc and tick items as “done” or “N/A”.
- **Bug list**
  - Separate list of confirmed bugs (with file:line or short repro) and priority.
- **Deferred list**
  - Items explicitly deferred (e.g. “E2E in v2”) with a short reason.

---

## 9. Definition of “Production Ready” (for this app)

Use this as the bar for closing the analysis:

- No known critical bugs (wrong code, broken flows, security issues).
- All main user flows have loading/empty/error handling and no silent failures.
- Auth, chat, settings, and at least one of (reports / jobs / vault) are feature-complete and tested to a minimum standard.
- Deployment (local, Docker, or packaged Electron) is documented and repeatable.
- Security: no keys in frontend; CORS and rate limiting configured; uploads and DB access validated.
- CLAUDE.md and README/SETUP_AND_DEPLOY reflect current setup and test commands.

Adjust the definition (e.g. “Clawd in scope”, “E2E required”) depending on what you consider “production” for this repo.
