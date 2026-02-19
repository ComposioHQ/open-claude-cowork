# AGENTS.md

Operational guidance for working in this repository.

## Priority and scope
- This file is the top-level rules index for the repo.
- Detailed agent behavior and runtime workflow live in `CLAUDE.md`.
- If there is any conflict, follow this file first for command-level rules, then `CLAUDE.md`.

## Required workflow
- Keep `README.md`, `SETUP_AND_DEPLOY.md`, `CLAUDE.md`, and test docs current when behavior or scripts change.
- For task handoffs and status updates, avoid adding stale references to removed files or scripts.
- Use this repository’s conventions for branching and pushing.

## Branch and Git policy
- Push only to your current feature branch on `origin`.
- Do not push to `upstream`.
- Do not push directly to protected `origin` branches (`main`, `master`) unless explicitly requested.

## Runtime and app rules
- Preferred local startup: `npm run start:all`.
- Backend-only startup: `npm run start:server`.
- App and backend must continue to support:
  - `npm run start:all`
  - `npm run start:server`
  - `npm start`
  - `npm run test`
  - `npm run test:server`
  - `npm run test:renderer`
  - `npm run test:e2e`

## Documentation policy
- Treat docs as versioned artifacts; when feature behavior changes, update both user-facing docs and internal agent docs in the same change.
- Any production readiness or bug-triage claims must match what is currently implemented, not historical snapshots.

## Docs hygiene checklist
- Before merging major changes, verify and update:
  - `README.md`
  - `CLAUDE.md`
  - `SETUP_AND_DEPLOY.md`
  - Relevant `tests/*.md` files
  - `PRODUCTION_READINESS_PLAN.md` (if scope/tests/security posture changed)
- Ensure command examples and counts are current (scripts and test totals).
- Remove stale migration/fork language when behavior is no longer in use.

## Tooling preferences
- For oauth-like integrations, default to Composio unless explicitly requested otherwise.
- For end-to-end verification, use Playwright where UI behavior is involved.

## Environment policy
- Use environment variables and `.env` keys for secrets.
- Never hard-code secrets in docs beyond placeholders.
- Required keys are documented in `.env.example` and `SETUP_AND_DEPLOY.md`.

## Compatibility note
- On case-insensitive filesystems, this file also serves `agents.md`.

