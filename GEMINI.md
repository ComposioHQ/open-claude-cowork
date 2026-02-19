# Open Claude Cowork - Project Context

Open Claude Cowork is a sophisticated, open-source desktop chat application and AI automation platform. It leverages the Claude Agent SDK, Composio Tool Router, and the Model Context Protocol (MCP) to provide end-to-end task automation across desktop environments and over 500+ web applications.

## Project Overview

The project is divided into three primary layers and a specialized messaging bot:

1.  **Electron Layer (`main.js`, `preload.js`):** Manages the desktop window, lifecycle, and provides a secure bridge between the frontend and backend.
2.  **Renderer Layer (`renderer/`):** A vanilla HTML/JS/CSS frontend providing a modern, dark-themed chat interface. It handles real-time streaming (SSE), tool visualization, and artifact rendering.
3.  **Backend Layer (`server/`):** A Node.js Express server that manages AI providers, sessions, tools, and integrations. It serves as the orchestration hub for Claude Agent SDK and MCP tools.
4.  **Clawd Layer (`clawd/`):** A separate messaging bot that connects Claude to platforms like WhatsApp, Telegram, Signal, and iMessage, including persistent memory and browser automation.

## Key Technologies

-   **AI Core:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
-   **Integrations:** Composio Tool Router (`@composio/core`), MCP (`@modelcontextprotocol/sdk`), Smithery Connect
-   **Database & Auth:** Supabase (PostgreSQL, Auth, Storage, Vector Search)
-   **Frontend:** Vanilla JavaScript, Marked (Markdown), Prism (Syntax Highlighting)
-   **Testing:** Vitest (Unit/Integration), Playwright (E2E)
-   **Automation:** Playwright (Browser), ExcelJS, PPTXGenJS, PDFKit (Documents)

## Core Mandates & Conventions

-   **Language:** Pure JavaScript (ESM in `server/` and `clawd/`, CommonJS in Electron root, Vanilla JS in `renderer/`). **No TypeScript, no bundlers.**
-   **Streaming:** Uses Server-Sent Events (SSE) for token-by-token response streaming and real-time tool feedback.
-   **Persistence:** Primary persistence via Supabase with `localStorage` fallback for unauthenticated or local-only mode.
-   **Provider Pattern:** The backend uses a provider abstraction (`server/providers/`) to encapsulate AI model logic.
-   **Security:** API keys and sensitive settings are stored in `user-settings.json` (local-only) or environment variables.

## Building and Running

### Setup
```bash
./setup.sh  # Installs dependencies for root and server
cp .env.example .env  # Add API keys
```

### Key Commands
-   **Start All (Recommended):** `npm run start:all` (Starts backend + Electron)
-   **Backend Only:** `npm run start:server` (Runs on port 3001)
-   **Electron Only:** `npm start`
-   **Development (Live-Reload):** `npm run dev` (Electron only)
-   **Clawd Bot:** `cd clawd && node cli.js`

### Testing
-   **Unit/Integration:** `npm test`
-   **E2E (Playwright):** `npm run test:e2e`
-   **Smoke Tests:** `npm run test:smoke`
-   **Full Matrix E2E:** `npm run test:e2e:matrix`

## Project Structure

-   `main.js`: Electron entry point.
-   `renderer/`: UI files (HTML, CSS, JS).
    -   `renderer.js`: Main UI logic.
    -   `auth.js`: Supabase Auth integration.
-   `server/`: Backend logic.
    -   `server.js`: Express server & API endpoints.
    -   `providers/`: AI SDK implementations (e.g., `claude-provider.js`).
    -   `supabase/`: DB, Auth, and Storage logic.
    -   `browser/`: Browser automation MCP server.
    -   `documents/`: Document generation MCP server.
-   `clawd/`: Messaging bot gateway.
    -   `adapters/`: Platform-specific messaging adapters.
    -   `agent/`: Claude agent runtime.
-   `.claude/skills/`: Custom agent skills (markdown-based).

## Development Guidelines

-   **Adding Tools:** New tools should ideally be implemented as MCP servers or added to the existing provider-allowed tools list in `server.js`.
-   **UI Updates:** Modify `renderer/style.css` for styling and `renderer/renderer.js` for logic. Avoid adding heavy external libraries.
-   **Backend Logic:** Use `server/server.js` for API endpoints and `server/supabase/` for data persistence.
-   **Testing:** Always add relevant tests in `tests/` for new features. Use `vitest` for logic and `playwright` for UI flows.
