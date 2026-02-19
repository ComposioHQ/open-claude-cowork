# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Claude Cowork is an Electron desktop chat application powered by Claude Agent SDK, Composio Tool Router, and optional Smithery Connect for MCP tools. It includes two main components:

1. **Desktop App** — Electron + Express chat interface using Claude Agent SDK for chat responses
2. **Clawd** — A messaging bot (`clawd/`) that connects Claude to WhatsApp, Telegram, Signal, and iMessage

## Running the App

### Setup
```bash
npm install && cd server && npm install && cd ..
cp .env.example .env  # Add API keys (see .env.example for all options)
```

### Start (single command)
```bash
npm run start:all
```

### Start (two terminals)
```bash
# Terminal 1 — backend on port 3001
npm run start:server

# Terminal 2 — Electron app
npm start
```

### Development mode (with live-reload)
```bash
npm run dev  # Electron only; server must be started separately
```

### Clawd bot
```bash
cd clawd && npm install && node cli.js
```

### Docker (web-only, no Electron)
```bash
docker build -t open-claude-cowork .
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=... \
  -e COMPOSIO_API_KEY=... \
  -e SUPABASE_URL=... \
  -e SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  open-claude-cowork
```

Tests are configured and run via `npm test` (Vitest unit/integration suite).

## Architecture

### Three-Layer Split

- **Electron process** (`main.js`, `preload.js`) — Creates the BrowserWindow, exposes `window.electronAPI` via context bridge to the renderer. `preload.js` hardcodes `SERVER_URL = http://localhost:3001`.
- **Renderer** (`renderer/`) — Vanilla HTML/JS/CSS frontend (no framework). `renderer.js` is the entire UI logic. `web-api.js` is a browser polyfill for `window.electronAPI` using relative URLs so the same UI works when deployed as a web app (Docker/Coolify).
- **Backend** (`server/`) — Express server (ESM, `"type": "module"`) serving SSE-streamed chat responses at `POST /api/chat`. Also serves the renderer as static files for web deployment.

### Provider System

The backend uses a provider abstraction (`server/providers/`) so the frontend can send `provider` and `model` in each chat request:

- `BaseProvider` — Abstract class defining `query()` (async generator yielding SSE chunks), `abort()`, session management
- `ClaudeProvider` — Wraps `@anthropic-ai/claude-agent-sdk` `query()`. Sessions are resumed via `session_id` from system init chunks.

Providers are registered in `server/providers/index.js` and cached as singletons. The frontend sends `provider` and `model` in each chat request.

### Communication Flow

1. Frontend calls `window.electronAPI.sendMessage(message, chatId, provider, model)`
2. Preload/web-api makes `POST /api/chat` with SSE response
3. Server gets/creates a Composio session and (when configured) a Smithery connection, passes MCP config to the selected provider
4. Provider streams chunks (`text`, `tool_use`, `tool_result`, `done`) as SSE `data:` lines
5. Frontend parses SSE, renders markdown (via `marked`), and shows inline tool calls

### Supabase Integration

The backend integrates with Supabase for persistence, auth, file storage, and vector search. All Supabase modules live in `server/supabase/`:

- `client.js` — Admin client (service role key, bypasses RLS) + factory for per-request user clients
- `auth-middleware.js` — `requireAuth` Express middleware: validates JWTs, falls back to anonymous if `ALLOW_ANONYMOUS=true`
- `chat-store.js` — Chat/message CRUD against Postgres
- `session-store.js` — Provider session persistence (in-memory Map cache with DB backing)
- `storage.js` — File upload/download via Supabase Storage (signed URLs, 1hr expiry)
- `embeddings.js` — OpenAI `text-embedding-3-small` vector embeddings, semantic search via pgvector
- `cron.js` — pg_cron for DB cleanup + Node.js setInterval for embedding pipeline (every 5min)
- `migrations/001_initial_schema.sql` — Full schema (profiles, chats, messages, provider_sessions, attachments, embeddings) with RLS

**Database tables:** `profiles`, `chats`, `messages`, `provider_sessions`, `attachments`, `embeddings` — all with per-user RLS.

**Auth flow:** Frontend uses Supabase Auth via CDN (`renderer/auth.js`). Token is stored in the preload/web-api layer and injected as `Authorization: Bearer <token>` on all API calls.

**Graceful degradation:** When Supabase env vars are not set, the app works without auth/persistence (localStorage fallback). When `ALLOW_ANONYMOUS=true`, unauthenticated requests are assigned `userId = 'anonymous:<session-key>'` (IP/UA-derived unless `x-anon-session-id` is provided).

### Composio Integration

On startup, the server initializes a Composio session (`@composio/core`) which provides an MCP URL. This URL is passed to providers as `mcpServers.composio` for tool access (500+ app integrations).

### Smithery Integration

Smithery Connect is an optional second tools provider. When a Smithery API key is set (via Settings or `SMITHERY_API_KEY` in `.env`), the server ensures a default connection (e.g. Exa search) and adds `mcpServers.smithery` with the Connect MCP endpoint and Bearer auth. The key can be configured in the app Settings page or via environment variable.

### Clawd (`clawd/`)

Separate Node.js app (ESM) with its own `package.json` and dependency tree. Entry point is `cli.js`. Key subsystems:
- `adapters/` — Platform-specific message adapters (WhatsApp via Baileys, Telegram via node-telegram-bot-api, Signal via signal-cli, iMessage via imsg CLI)
- `agent/` — Claude agent runtime
- `browser/` — Playwright-based browser automation (clawd mode or Chrome CDP mode)
- `memory/` — Persistent memory system (MEMORY.md + daily logs in `~/clawd/`)
- `tools/` — Built-in tools including cron scheduling
- Config lives in `clawd/config.js`

## Key Conventions

- Backend uses ESM (`import`/`export`); root Electron files use CommonJS (`require`)
- No TypeScript, no build step, no bundler — all plain JavaScript
- `npm test` runs Vitest (`vitest run`) for backend and integration suites
- Frontend state is persisted to Supabase (when configured) with `localStorage` fallback. Provider/model selection always uses localStorage.
- `renderer/auth.js` handles Supabase Auth (CDN-loaded, no bundler). Token refresh is automatic.
- Streaming uses Server-Sent Events with heartbeat comments every 15s
- No provider-specific runtime config files are written by this fork.
- The `.env` file in the project root is shared between the desktop app and server

## Git Workflow Rules

- Push only to your current feature branch on `origin`.
- Do not push to `upstream` or protected `origin` branches (`main`, `master`, etc.) unless explicitly requested.
