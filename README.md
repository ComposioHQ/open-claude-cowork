<p align="center">
  <h1 align="center">Open Claude Cowork</h1>
</p>

<p align="center">
  <img src="open-claude-cowork.gif" alt="Open Claude Cowork Demo" width="800">
</p>

<p align="center">
  <a href="https://docs.composio.dev/tool-router/overview">
    <img src="https://img.shields.io/badge/Composio-Tool%20Router-orange" alt="Composio">
  </a>
  <a href="https://platform.claude.com/docs/en/agent-sdk/overview">
    <img src="https://img.shields.io/badge/Claude-Agent%20SDK-blue" alt="Claude Agent SDK">
  </a>
  <a href="https://github.com/anthropics/claude-code">
    <img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-purple" alt="Claude Code">
  </a>
  <a href="https://dub.composio.dev/discord">
    <img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white" alt="Discord">
  </a>
  <a href="https://x.com/composio">
    <img src="https://img.shields.io/twitter/follow/composio?style=social" alt="Twitter">
  </a>
  <a href="https://github.com/ComposioHQ/open-claude-cowork/stargazers">
    <img src="https://img.shields.io/github/stars/ComposioHQ/open-claude-cowork?style=social" alt="GitHub Stars">
  </a>
</p>

<p align="center">
  <strong>An open-source Claude desktop app that doesn't just chat — it takes action.</strong>
</p>

<p align="center">
  Send emails, create PRs, manage calendars, post to Slack — all from natural language prompts.<br/>
  Powered by <a href="https://composio.dev/toolkits">800+ tool integrations</a> via Composio.
</p>

<p align="center">
  <a href="./README_ZH.md">简体中文</a> | English
</p>

<p align="center">
  <a href="https://platform.composio.dev?utm_source=github&utm_medium=readme&utm_campaign=open-claude-cowork">
    <img src="https://img.shields.io/badge/Get%20Started-Composio%20Platform-orange?style=for-the-badge" alt="Get Started with Composio">
  </a>
</p>

---

## Why This One?

Most Claude desktop apps are GUI wrappers — they give you a nice interface, but Claude can only chat.

**Open Claude Cowork connects Claude to the real world.** Through Composio's tool router, Claude can actually execute actions: read your emails, create GitHub issues, update your CRM, schedule meetings, and more.

| Capability | Open Claude Cowork | Typical Claude GUIs |
|------------|-------------------|---------------------|
| **External Integrations** | 800+ apps (Gmail, Slack, GitHub, Calendar, Salesforce, HubSpot, Linear, etc.) | None |
| **Multi-Model Support** | Claude + GPT-5 + Grok + GLM + MiniMax | Claude only |
| **Execute Real Actions** | Sends emails, creates PRs, schedules meetings | Chat only |
| **Open Source** | Yes | Yes |

---

## What You Can Do

### Developer Workflow
> "Review my open GitHub PRs and summarize them in Slack #dev-updates"

Claude reads your PRs via GitHub API, analyzes them, and posts a formatted summary to Slack.

### Email Triage
> "Check my Gmail for urgent emails and draft responses for the top 3"

Claude scans your inbox, identifies priority messages, and drafts contextual replies.

### Meeting Prep
> "Look at my Google Calendar for tomorrow and create a prep doc in Google Drive"

Claude pulls your schedule and generates a meeting brief with relevant context.

### Code + Communicate
> "Fix the bug in issue #42, create a PR, and notify the team on Slack"

Claude reads the issue, writes the fix, opens a PR, and posts an update — all in one prompt.

---

## Features

- **Multi-Provider Support** - Choose between Claude Agent SDK and Opencode for different model options
- **Claude Agent SDK Integration** - Full agentic capabilities with tool use and multi-turn conversations
- **Opencode SDK Support** - Access multiple LLM providers (Claude, GPT-5, Grok, GLM, MiniMax, and more)
- **Composio Tool Router** - Access to 800+ external tools (Gmail, Slack, GitHub, Google Drive, and more)
- **Persistent Chat Sessions** - Conversations maintain context across messages using SDK session management
- **Multi-Chat Support** - Create and switch between multiple chat sessions
- **Real-time Streaming** - Server-Sent Events (SSE) for smooth, token-by-token response streaming
- **Tool Call Visualization** - See tool inputs and outputs in real-time in the sidebar
- **Progress Tracking** - Todo list integration for tracking agent task progress
- **Modern UI** - Clean, dark-themed interface inspired by Claude.ai
- **Desktop App** - Native Electron application for macOS, Windows, and Linux

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Desktop Framework** | Electron.js |
| **Backend** | Node.js + Express |
| **AI Providers** | Claude Agent SDK + Opencode SDK |
| **Tool Integration** | Composio Tool Router + MCP |
| **Streaming** | Server-Sent Events (SSE) |
| **Markdown** | Marked.js |
| **Styling** | Vanilla CSS |

---

## Getting Started

### Quick Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/ComposioHQ/open-claude-cowork.git
cd open-claude-cowork

# Run the automated setup script
./setup.sh
```

The setup script will:
- Install Composio CLI if not already installed
- Guide you through Composio signup/login
- Configure your API keys in `.env`
- Install all project dependencies

### Manual Setup

If you prefer manual setup, follow these steps:

#### Prerequisites

- Node.js 18+ installed
- **For Claude Provider:**
  - Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- **For Opencode Provider:**
  - Opencode API key ([opencode.dev](https://opencode.dev))
- Composio API key ([app.composio.dev](https://app.composio.dev))

#### 1. Clone the Repository

```bash
git clone https://github.com/ComposioHQ/open-claude-cowork.git
cd open-claude-cowork
```

#### 2. Install Dependencies

```bash
# Install Electron app dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

#### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
# Claude Provider
ANTHROPIC_API_KEY=your-anthropic-api-key

# Opencode Provider (optional)
OPENCODE_API_KEY=your-opencode-api-key
OPENCODE_HOSTNAME=127.0.0.1
OPENCODE_PORT=4096

# Composio Integration
COMPOSIO_API_KEY=your-composio-api-key
```

**Provider Selection:**
- The app allows switching between **Claude** and **Opencode** providers in the UI
- Only configure the API key(s) for the provider(s) you want to use
- Opencode can route to multiple model providers through a single SDK

### Starting the Application

You need **two terminal windows**:

**Terminal 1 - Backend Server:**
```bash
cd server
npm start
```

**Terminal 2 - Electron App:**
```bash
npm start
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                              │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │   Main Process  │    │ Renderer Process │                    │
│  │   (main.js)     │    │  (renderer.js)   │                    │
│  └────────┬────────┘    └────────┬─────────┘                    │
│           │                      │                               │
│           └──────────┬───────────┘                               │
│                      │ IPC (preload.js)                          │
└──────────────────────┼───────────────────────────────────────────┘
                       │
                       │ HTTP + SSE
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend Server                               │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Express.js     │───▶│ Claude Agent SDK │                    │
│  │  (server.js)    │    │  + Session Mgmt  │                    │
│  └─────────────────┘    └────────┬─────────┘                    │
│                                  │                               │
│                                  ▼                               │
│                    ┌─────────────────────────┐                   │
│                    │   Composio Tool Router  │                   │
│                    │   (MCP Server)          │                   │
│                    └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### Session Management

The app uses Claude Agent SDK's built-in session management:
1. First message creates a new session, returning a `session_id`
2. Subsequent messages use `resume` option with the stored session ID
3. Full conversation context is maintained server-side

### Tool Integration

Composio Tool Router provides MCP server integration:
- Tools are authenticated per-user via Composio dashboard
- Available tools include Google Workspace, Slack, GitHub, and 800+ more
- Tool calls are streamed and displayed in real-time

### Provider Architecture

The application supports multiple AI providers through a pluggable provider system:

#### Claude Provider
- Uses Anthropic's Claude Agent SDK
- Available models:
  - Claude Opus 4.5 (claude-opus-4-5-20250514)
  - Claude Sonnet 4.5 (claude-sonnet-4-5-20250514) - default
  - Claude Haiku 4.5 (claude-haiku-4-5-20250514)
- Session management via built-in SDK session tracking
- Direct streaming from Claude API

#### Opencode Provider
- Routes to multiple LLM providers through a single SDK
- Available models:
  - `opencode/big-pickle` - Free reasoning model (default)
  - `opencode/gpt-5-nano` - OpenAI's reasoning models
  - `opencode/glm-4.7-free` - Zhipu GLM models
  - `opencode/grok-code` - xAI Grok for coding
  - `opencode/minimax-m2.1-free` - MiniMax models
  - `anthropic/*` - Claude models through Opencode
- Event-based streaming with real-time part updates
- Session management per chat conversation
- Extended thinking support (reasoning parts)

**Streaming Implementation:**
Both providers use Server-Sent Events (SSE) for streaming responses:
- Backend: Express server streams normalized chunks via HTTP
- Frontend: Real-time processing with markdown rendering
- Tool calls: Inline display with input/output visualization

### MCP Configuration (Tools Integration)

**Important: Opencode requires MCP servers to be configured in `server/opencode.json`**

The application automatically updates this file when starting:
1. Composio session is created on first request with MCP URL
2. Backend writes the MCP config to `server/opencode.json`
3. Opencode reads the config file and loads MCP tools

**File: `server/opencode.json`**
```json
{
  "mcp": {
    "composio": {
      "type": "remote",
      "url": "https://backend.composio.dev/tool_router/YOUR_ROUTER_ID/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Note:** Don't manually edit this file - it's generated automatically by the backend. The placeholders are replaced with real credentials from your Composio session.

---

## File Structure

```
open-claude-cowork/
├── main.js                 # Electron main process
├── preload.js              # IPC security bridge
├── renderer/
│   ├── index.html          # Chat interface
│   ├── renderer.js         # Frontend logic & streaming handler
│   └── style.css           # Styling
├── server/
│   ├── server.js           # Express + Provider routing + MCP config writer
│   ├── opencode.json       # MCP config (auto-generated, see note below)
│   ├── providers/
│   │   ├── base-provider.js      # Abstract base class
│   │   ├── claude-provider.js    # Claude Agent SDK implementation
│   │   └── opencode-provider.js  # Opencode SDK implementation
│   └── package.json
├── package.json
├── .env                    # API keys (not tracked)
└── .env.example            # Template
```

**Note on `server/opencode.json`:**
- Generated automatically by the backend when you run the app
- Contains Composio MCP URL and credentials
- Opencode reads this file to load tools
- Don't track in git (add to `.gitignore` or use template)

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the Electron app |
| `npm run dev` | Start in development mode with live reload |
| `cd server && npm start` | Start the backend server |

---

## Troubleshooting

**"Failed to connect to backend"**
- Ensure backend server is running on port 3001
- Check Terminal 1 for error logs
- Verify firewall isn't blocking localhost:3001

**"API key error"**
- For Claude: Verify `ANTHROPIC_API_KEY` in `.env` starts with `sk-ant-`
- For Opencode: Ensure `OPENCODE_API_KEY` is valid and from opencode.dev
- Ensure `COMPOSIO_API_KEY` is valid

**"Provider not available"**
- Ensure the required API key is configured in `.env`
- Restart the backend server after changing `.env`
- Check server logs for initialization errors

**"Session not persisting"**
- Check server logs for session ID capture
- Ensure `chatId` is being passed from frontend
- Different providers use different session mechanisms (Claude SDK vs Opencode sessions)

**"Streaming seems slow or incomplete"**
- Check network/firewall settings for SSE connections
- Verify backend is receiving events from provider SDK
- Check browser console for connection errors
- For Opencode: Ensure event subscription is receiving `message.part.updated` events

**"Opencode models not responding"**
- Verify Opencode server is running (localhost:4096 or configured URL)
- Check that model identifiers match Opencode format (e.g., `opencode/big-pickle`)
- Review Opencode API documentation for available models
- Check server logs for Opencode SDK initialization errors

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Resources

- [Claude Agent SDK Documentation](https://docs.anthropic.com/en/docs/claude-agent-sdk)
- [Opencode SDK Documentation](https://docs.opencode.dev)
- [Composio Tool Router](https://docs.composio.dev/tool-router)
- [Composio Dashboard](https://app.composio.dev)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Opencode Platform](https://opencode.dev)

---

<p align="center">
  Built with Claude Code and Composio
</p>
