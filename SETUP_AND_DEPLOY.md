# Open Claude Cowork — Setup & Deployment

This document covers this fork’s setup, how to run the app locally, how to deploy it on Coolify, and what still needs to be done.

## Repository rules index

Before making setup/deploy or environment changes, check `AGENTS.md` for current repository-wide rules and workflow constraints.

---

## Repository & fork

- **Original:** [ComposioHQ/open-claude-cowork](https://github.com/ComposioHQ/open-claude-cowork)
- **This fork:** [ignitabull18/open-claude-cowork](https://github.com/ignitabull18/open-claude-cowork)

**Git remotes (after fork):**

| Remote    | URL                                              | Use for                |
|-----------|--------------------------------------------------|------------------------|
| `origin`  | `https://github.com/ignitabull18/open-claude-cowork.git` | Your fork; default push |
| `upstream`| `https://github.com/ComposioHQ/open-claude-cowork`       | Sync from original      |

- Push your work: `git push origin <branch>`
- Pull updates from original: `git fetch upstream` then merge or rebase.

---

## Local setup

### 1. Dependencies

```bash
cd open-claude-cowork
npm install
cd server && npm install && cd ..
```

### 2. API keys (`.env`)

Create `.env` in the project root (copy from `.env.example`). Required:

- **ANTHROPIC_API_KEY** — from [console.anthropic.com](https://console.anthropic.com)
- **COMPOSIO_API_KEY** — from [app.composio.dev](https://app.composio.dev)

Optional: use 1Password CLI to fill `.env`:

```bash
# From project root
op read "op://APIs/Anthropic API/credential"  # paste into ANTHROPIC_API_KEY=
op read "op://APIs/Composio API/credential"  # paste into COMPOSIO_API_KEY=
# Or script it:
printf 'ANTHROPIC_API_KEY=%s\nCOMPOSIO_API_KEY=%s\n' \
  "$(op read 'op://APIs/Anthropic API/credential')" \
  "$(op read 'op://APIs/Composio API/credential')" > .env
```

### 3. Running the app

**Option A — One command (recommended):**

```bash
npm run start:all
```

Starts the backend server, waits for it to be ready, then opens the Electron window. When you close the app, the server stops.

**Option B — Two terminals:**

```bash
# Terminal 1 — backend
npm run start:server
# or: cd server && npm start

# Terminal 2 — desktop app (after server is up)
npm start
```

- Backend: http://localhost:3001  
- If you run only `npm start` (Electron) without the server, a red banner in the app will tell you to start the backend.

---

## What was added in this fork

### Desktop / local

- **Backend health check** — On load, the app checks if the backend is reachable; if not, a red banner shows how to start it.
- **`npm run start:all`** — Single command to start server + Electron via `scripts/start-all.js`.
- **`npm run start:server`** — Runs only the backend (for two-terminal workflow).

### Web / Coolify deployment

- **`renderer/web-api.js`** — Browser adapter for `window.electronAPI` so the same UI works in the browser using relative URLs (`/api/chat`, `/api/health`, etc.).
- **`renderer/index.html`** — Loads `web-api.js`; in Electron the preload script already provides `electronAPI`, so the adapter only runs in the browser.
- **`server/server.js`** — Serves the `renderer` folder as static files and `GET /` as the web UI when the `renderer` directory exists (for Docker/Coolify).
- **`Dockerfile`** — Builds server + renderer and runs `node server.js` on port 3001.
- **`.dockerignore`** — Keeps build context small and excludes `.env`, `node_modules`, Electron-only files, etc.

---

## Deploying on Coolify

### Build

- **Build type:** Dockerfile (repo root).
- **Port:** 3001.

### Environment variables (set in Coolify UI)

| Variable             | Required | Notes                          |
|----------------------|----------|--------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | From Anthropic console         |
| `COMPOSIO_API_KEY`   | Yes      | From Composio                  |
| `PORT`               | Optional | Coolify often sets this        |
| `CORS_ORIGINS`       | Yes (prod) | In production, set to your app origin (e.g. `https://cowork.ignitabull.org`). If unset, no origins are allowed. |
| `ADMIN_EMAILS`       | Optional   | Comma-separated emails that see **Database Explorer** in the nav. If unset, the button is hidden for everyone. |

Do **not** put `.env` in the image; use Coolify’s env/secrets.

Run `npm audit` (and `cd server && npm audit`) periodically; apply `npm audit fix` where safe. Some server dev dependencies may report high severity and require major version updates.

### Steps in Coolify

1. Connect your Git (e.g. GitHub) and select this repo: **ignitabull18/open-claude-cowork**.
2. Create a new resource → deploy from Git.
3. Set build to **Dockerfile** (context: repo root).
4. Set port to **3001**.
5. Add environment variables (or secrets): `ANTHROPIC_API_KEY`, `COMPOSIO_API_KEY`.
6. Deploy. Coolify will build the image and run the container.
7. Open the URL Coolify gives you; the web UI will load at `/` and use the same API at `/api/*`.

### Test the image locally (optional)

With Docker running:

```bash
docker build -t open-claude-cowork .
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=your-key \
  -e COMPOSIO_API_KEY=your-key \
  open-claude-cowork
```

Then open http://localhost:3001 in a browser.

### Test user and E2E workflow (deployed app)

To sign in on the deployed web app and create a workflow (job) for testing, use a Supabase test user and the Playwright script.

**1. Create a test user** (requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` or env):

```bash
node scripts/create-test-user.js "autotest+e2e@coworktest.local" "YourPassword123!"
```

Output is JSON with `email`, `password`, and `id`. Use that email/password to sign in at the deployed URL.

**2. Run deploy smoke check** (no auth):

```bash
node scripts/deploy-smoke-check.js https://your-deployment.example.com
```

**Trigger Coolify deploy** (after pushing code):

```bash
node scripts/trigger-coolify-deploy.js
```

Uses `COOLIFY_BASE_URL` and `COOLIFY_API_TOKEN` from env, or 1Password (Coolify2 API url/credential). App UUID defaults to the open-claude-cowork application on Coolify2.

**3. Sign in and create a workflow** (Playwright; no local server):

```bash
BASE_URL=https://your-deployment.example.com \
TEST_USER_EMAIL=autotest+e2e@coworktest.local \
TEST_USER_PASSWORD='YourPassword123!' \
npm run test:e2e:workflow
```

Or run the script directly: `node scripts/e2e-signin-and-workflow.js`. Requires `npm install` (Playwright is a dev dependency). The script opens the app in a headless browser, signs in, goes to Workflows → New Workflow, and creates a “Chat message” job. Success means `POST /api/jobs` returns 200.

**4. Schedule workflows** (set cron/recurring on existing jobs by name):

```bash
BASE_URL=https://your-deployment.example.com TEST_USER_EMAIL=... TEST_USER_PASSWORD='...' npm run schedule:workflows
```

**5. Test that a scheduled run executes** (set one job to run "now", wait for scheduler, check executions):

```bash
BASE_URL=... TEST_USER_EMAIL=... TEST_USER_PASSWORD='...' npm run test:scheduled
```

Optional: `TEST_JOB_NAME=Reminder check` and `TEST_WAIT_SEC=90`.

---

## What needs to be done

- [ ] **Coolify:** Create a Coolify project, connect this repo, set port 3001 and env vars, then deploy and confirm the web UI and chat work.
- [ ] **Optional — Sync from upstream:** Periodically pull from `ComposioHQ/open-claude-cowork` and merge or rebase: `git fetch upstream && git merge upstream/main` (or your workflow).
- [ ] **Optional — Custom domain:** In Coolify, attach a custom domain and enable HTTPS if desired; the app uses relative URLs so no code change is needed.

---

## Project layout (relevant parts)

```
open-claude-cowork/
├── main.js              # Electron main process
├── preload.js           # Electron preload (SERVER_URL = localhost:3001)
├── renderer/            # UI (shared by Electron and web)
│   ├── index.html
│   ├── renderer.js
│   ├── style.css
│   └── web-api.js       # Browser adapter for electronAPI
├── server/              # Backend API
│   ├── server.js        # Express; serves /api/* and (if renderer exists) static UI
│   └── providers/
├── scripts/
│   ├── start-all.js           # Starts server then Electron
│   ├── create-test-user.js    # Create Supabase Auth test user (env: SUPABASE_*)
│   ├── deploy-smoke-check.js  # Hit deploy URL health/config/APIs (no auth)
│   ├── e2e-signin-and-workflow.js  # Playwright: sign in on deploy URL and create a job
│   ├── trigger-coolify-deploy.js   # Trigger Coolify deploy via API (env or 1Password)
│   ├── schedule-workflows.js       # PATCH jobs by name with cron/recurring (env: BASE_URL, TEST_USER_*)
│   └── test-scheduled-run.js       # Set one job to run now, wait, assert execution (env: TEST_JOB_NAME, TEST_WAIT_SEC)
├── Dockerfile           # For Coolify / Docker
├── .dockerignore
├── .env.example
└── SETUP_AND_DEPLOY.md  # This file
```

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| App says “Backend not running” | Start backend: `npm run start:server` or `npm run start:all`. |
| Electron won’t start | Ensure Electron is installed: `rm -rf node_modules/electron && npm install electron`. |
| Coolify build fails | Check Dockerfile path and that `server/` and `renderer/` exist; ensure no required files are in `.dockerignore`. |
| Web UI 404 on Coolify | Confirm port is 3001 and the container is healthy; check Coolify logs for Node errors. |
