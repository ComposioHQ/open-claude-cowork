# Production User Tester Audit Report

**Environment:** https://cowork.ignitabull.org  
**Date:** 2026-02-19  
**Scope:** Sign-in, Settings (API keys), Chat, Workflows, and overall UX from an end-user perspective.

---

## Summary

A hands-on session was run as a real user: sign-in with test credentials, Settings API key flow (entry, toggles, save), Chat (compose and send), and Workflows (create a Chat Message job). Findings are below with severity, reproduction steps, and recommendations.

---

## What Works Well

- **Sign-in:** Auth form is clear (Email, Password, Sign In/Sign Up tabs). Test login with `autotest+e2e@coworktest.local` / `TestPassword123!` succeeded; post-login state showed the main app with sidebar (Home, Chats, Tasks, Assets Vault, Reports, Workflows, Settings, Sign Out).
- **Navigation:** Sidebar labels and flow between Home, Chats, Workflows, and Settings are obvious.
- **Settings layout:** API key section is grouped (Anthropic, Composio, Smithery, DataForSEO). Show/Hide toggles work (button text switches to "Hide" when revealed). Masked status labels ("Not set" / "Set (...)") are present.
- **Workflow form:** New Workflow opens a form with Name, Description, Workflow Type (One-time / Recurring / Cron), Execute At, Action Type (Report Generation, Webhook, Data Export, Chat Message, Run Workflow). For "Chat Message", Message Prompt, Provider, and Max Turns appear. Execute At and Save Job are available.
- **Error surfacing:** When Settings save failed, the UI showed "Internal server error" in the inline status below the form (no silent failure).

---

## What Feels Confusing or Incomplete

- **Settings save failure:** Saving API keys returned "Internal server error" with no actionable detail (e.g. backend file write, permissions, or validation). Masked status correctly stayed "Not set" after failure.
- **Workflow list after save:** After submitting a new workflow (name, description, Chat Message prompt, Execute At, Save Job), the Workflows list still showed "No workflows yet. Click 'New Workflow' to get started." No success toast or list refresh was observed; unclear whether the job was created and the list failed to update or the create failed.
- **Chat send feedback:** A message was sent from the Chats view; no visible confirmation, error toast, or assistant reply was observed in the automated run (possible backend/streaming or API key issue; no in-UI explanation).
- **First-time user:** No onboarding or tooltips for "where to put API keys" or "what Workflows do"; power users can infer, new users may be lost.

---

## Key Features Present and Set Up

| Feature | Present | Notes |
|--------|---------|------|
| Auth (Supabase) | Yes | Sign In/Sign Up; test user works. |
| Settings → API keys | Yes | Anthropic, Composio, Smithery, DataForSEO; Save keys; Show/Hide; masked status. |
| Chat | Yes | Reply input, Send, provider/model (Claude, Sonnet 4.5), attach, extended thinking. |
| Workflows | Yes | List, New Workflow, form with type/action/schedule; Save Job. |
| Home | Yes | "Ask me anything" input and same send/attach/model controls. |

---

## Prioritized Findings

### Critical

**C1. Settings save returns 500 (Internal server error)**  
- **Repro:** Sign in → Settings → enter any value in Anthropic API key → Save keys.  
- **Observed:** Status text: "Internal server error"; masked value stays "Not set."  
- **Recommendation:** Log server-side cause (e.g. file write, env, validation); return a safe, user-facing message (e.g. "Could not save settings. Try again or contact support.") and/or fix persistence (e.g. writable volume in Docker, user-scoped storage).

**C2. Workflow create success/failure not clear**  
- **Repro:** Sign in → Workflows → New Workflow → fill Name, Description, Action Type "Chat Message", Message Prompt, Execute At → Save Job.  
- **Observed:** Form closes; list still shows "No workflows yet." No success or error toast.  
- **Recommendation:** On successful create: show a short success toast and refresh the jobs list (or navigate to the new job). On failure: show error toast with message from API; keep form open with data so user can retry.

### High

**H1. No loading state on Settings save**  
- **Repro:** Settings → fill a key → Save keys.  
- **Observed:** Button stays enabled; no spinner or "Saving…".  
- **Recommendation:** Disable "Save keys" and show "Saving…" (or spinner) until the request resolves.

**H2. Chat send has no visible success/error feedback**  
- **Repro:** Chats → type in Reply → Send message.  
- **Observed:** No clear confirmation, streaming reply, or error message in the captured flow.  
- **Recommendation:** Ensure errors (e.g. missing/invalid API key, network) surface in the chat area or a toast; show a loading/streaming state so the user knows the request is in progress.

**H3. Backend 500 on settings not actionable**  
- **Repro:** Same as C1.  
- **Observed:** Generic "Internal server error."  
- **Recommendation:** Differentiate known cases (e.g. 404 → "Restart backend"; file error → "Could not save; check server logs") and avoid exposing stack traces or internal details.

### Medium

**M1. No validation or hints for API key format**  
- **Repro:** Settings → Anthropic key field.  
- **Observed:** No format hint (e.g. "sk-ant-...") or client-side validation before save.  
- **Recommendation:** Add placeholder or short hint per key type; optional client-side format check and inline error before submit.

**M2. Workflow list empty after create**  
- **Repro:** Same as C2.  
- **Observed:** List not updated after Save Job.  
- **Recommendation:** After POST /api/jobs success, refetch GET /api/jobs and re-render the list (or optimistically append the new job).

**M3. No "Forgot password" or recovery link**  
- **Repro:** Auth screen.  
- **Observed:** Only Sign In / Sign Up and credentials.  
- **Recommendation:** Add "Forgot password?" linking to Supabase recovery flow if auth is required for production.

### Low

**L1. Sign-in loading state**  
- **Repro:** Submit Sign In.  
- **Observed:** No spinner or disabled button during request.  
- **Recommendation:** Disable submit and show "Signing in…" (or spinner) until response.

**L2. Accessibility of status messages**  
- **Repro:** Settings save error or success.  
- **Observed:** Status text is visible; not confirmed if announced to screen readers.  
- **Recommendation:** Use `role="alert"` or `aria-live` for Settings status and toasts so assistive tech announces them.

---

## UX Gap Analysis (User Perspective)

- **Discoverability:** Main areas (Chat, Workflows, Settings) are discoverable from the sidebar. What API keys are for and where to get them is not explained in-app.
- **Clarity:** Labels and layout are clear. Error messages (e.g. "Internal server error") and missing feedback after workflow save or chat send reduce clarity.
- **Validation:** No client-side validation observed for API key format or required workflow fields before submit; backend may still reject.
- **Error handling:** Settings errors are shown inline; workflow and chat flows need consistent, visible success/error feedback and list refresh.
- **Feature completeness:** Core features (auth, settings, chat, workflows) are present; onboarding, recovery, and clearer feedback would better support real users.

---

## Recommendations (Implementation Order)

1. **Fix Settings save 500** – Resolve server-side cause (storage/env) and return a user-safe message.  
2. **Workflow create feedback** – On success: toast + refresh list (or open new job). On failure: toast + keep form.  
3. **Chat send feedback** – Show loading/streaming and surface errors in UI or toast.  
4. **Settings save loading** – Disable Save keys and show "Saving…" until response.  
5. **Auth loading** – Disable Sign In and show "Signing in…" during request.  
6. **API key hints/validation** – Placeholders or hints and optional client-side format check.  
7. **Forgot password** – Link to Supabase password recovery.  
8. **Accessibility** – `role="alert"` or `aria-live` for status and toasts.

---

## Test Session Details

- **Sign-in:** Used test user from repo docs; session persisted and sidebar/app loaded.  
- **Settings:** Opened Settings, toggled Show on Anthropic key (became Hide), filled placeholder key, Save keys → "Internal server error"; masked stayed "Not set."  
- **Chat:** Opened Chats, typed message, clicked Send; no visible reply or error in session.  
- **Workflows:** New Workflow → Name, Description, Chat Message, Message Prompt, Execute At → Save Job; list remained "No workflows yet."  
- **Home:** Opened Home; "Ask me anything" and controls present.

Screenshots were captured during the run (e.g. post-login, Settings with error state) for reference.
