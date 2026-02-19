# Audit Fix List

Actionable checklist to address findings from the [Production User Tester Audit](PRODUCTION_USER_TESTER_AUDIT_REPORT.md). Work in this order for maximum impact.

---

## Critical

- [x] **C1. Fix Settings save 500 (Internal server error)**
  - Investigate server-side cause: [server/server.js](server/server.js) `PUT /api/settings` and any file write / user-settings persistence (e.g. [server/utils/settings-utils.js](server/utils/settings-utils.js)).
  - Ensure writable storage in Docker/deployed env (volume or user-scoped path).
  - Return a safe, user-facing error message instead of raw "Internal server error"; log details server-side only.
  - **Files:** `server/server.js`, settings persistence layer, deployment config (e.g. Coolify/Dockerfile).

- [x] **C2. Workflow create: success and failure feedback**
  - On **success:** show a short success toast and refetch jobs list (or navigate to new job). Ensure [renderer/renderer.js](renderer/renderer.js) job save handler calls `loadJobs()` after successful `POST /api/jobs`.
  - On **failure:** show error toast with API message; keep form open with data so user can retry.
  - **Files:** `renderer/renderer.js` (save job handler, toast, `loadJobs`).

---

## High

- [x] **H1. Settings save loading state**
  - Disable "Save keys" button and show "Saving…" (or spinner) until the request resolves.
  - **Files:** `renderer/renderer.js` (`saveSettingsKeys`, `#settingsSaveKeysBtn`).

- [x] **H2. Chat send: visible success/error and loading**
  - Ensure errors (missing/invalid API key, network) surface in chat area or toast.
  - Show loading/streaming state so user knows the request is in progress.
  - **Files:** `renderer/renderer.js` (chat send flow, error handling, streaming UI).

- [x] **H3. Backend: actionable error messages for settings**
  - Differentiate known cases (e.g. 404 → "Restart backend"; file/permission error → "Could not save settings. Try again.").
  - Do not expose stack traces or internal details to the client.
  - **Files:** `server/server.js` (PUT `/api/settings` error handling).

---

## Medium

- [x] **M1. API key format hints and optional validation**
  - Add placeholders or short hints per key type (e.g. Anthropic: "sk-ant-...").
  - Optional: client-side format check and inline error before submit.
  - **Files:** `renderer/index.html` or `renderer/renderer.js` (settings form labels/placeholders).

- [x] **M2. Workflow list refresh after create**
  - After `POST /api/jobs` success, call `loadJobs()` (or equivalent) and re-render the list (or optimistically append the new job).
  - **Files:** `renderer/renderer.js` (job save success path).

- [x] **M3. Forgot password link**
  - Add "Forgot password?" on auth screen linking to Supabase password recovery flow.
  - **Files:** `renderer/index.html`, `renderer/auth.js` or `renderer/renderer.js` (auth UI).

---

## Low

- [x] **L1. Sign-in loading state**
  - Disable submit button and show "Signing in…" (or spinner) until auth response.
  - **Files:** `renderer/renderer.js` (auth submit handler, `#authSubmitBtn`).

- [x] **L2. Accessibility: status and toasts**
  - Use `role="alert"` or `aria-live` for Settings status and app toasts so screen readers announce them.
  - **Files:** `renderer/index.html`, `renderer/renderer.js` (settings status element, toast element).

---

## Reference

- **Audit report:** [PRODUCTION_USER_TESTER_AUDIT_REPORT.md](PRODUCTION_USER_TESTER_AUDIT_REPORT.md)
- **Deployment/setup:** [SETUP_AND_DEPLOY.md](SETUP_AND_DEPLOY.md)
