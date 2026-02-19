<p align="center">
  <h1 align="center">Open Claude Cowork</h1>
</p>
<p align="center">
  <a href="https://platform.composio.dev?utm_source=github&utm_medium=gif&utm_campaign=2101&utm_content=open-claude-cowork">
    <img src="assets/clawd-bot-video.gif" alt="Secure Clawdbot Demo" width="800">
  </a>
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
  <a href="https://twitter.com/composio">
    <img src="https://img.shields.io/twitter/follow/composio?style=social" alt="Twitter">
  </a>
</p>

<p align="center">
  An open-source desktop chat application powered by Claude Agent SDK and Composio Tool Router. Automate your work end-to-end across desktop and all your work apps in one place.
  <br><br>
  <a href="https://platform.composio.dev?utm_source=github&utm_medium=description&utm_campaign=2101&utm_content=open-claude-cowork">
    <b>Get your free API key to get started →</b>
  </a>
</p>

<p align="center">
  <i>Pst. hey, you, join our stargazers :)</i>
  <br>
  <a href="https://github.com/ignitabull18/open-claude-cowork">
    <img src="https://img.shields.io/github/stars/ignitabull18/open-claude-cowork.svg?style=social&label=Star&maxAge=2592000" alt="GitHub stars">
  </a>
</p>

---

## What's Inside

This repo includes two powerful AI tools:

| | **Open Claude Cowork** | 🦑 **Secure Clawdbot** |
|---|---|---|
| **What** | Full-featured desktop chat interface | Personal AI assistant on messaging |
| **Where** | macOS, Windows, Linux | WhatsApp, Telegram, Signal, iMessage |
| **Best for** | Work automation, multi-chat sessions | On-the-go AI access, reminders, memory |

Both include **500+ app integrations** via Composio (Gmail, Slack, GitHub, Google Drive, and more).

---

## Quick Start

### Open Claude Cowork

```bash
git clone https://github.com/ignitabull18/open-claude-cowork.git
cd open-claude-cowork
./setup.sh
```

Run from the repo root:

```bash
npm run start:all
```

Or in two terminals (legacy flow):
```bash
# Terminal 1
cd server && npm start

# Terminal 2
npm start
```

### End-to-end Testing

```bash
npm run test:e2e:smoke-matrix
npm run test:e2e:critical-matrix
```

`test:e2e:smoke-matrix`
- Full smoke suite (`tests/smoke.spec.js`) across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.

`test:e2e:critical-matrix`
- Critical user journey suite (`tests/critical-user-journeys.spec.js`) across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.

`test:e2e:matrix`
- Everything (`smoke + critical`) across the same 5 browser/device targets.

`test:e2e:ci`
- Same full matrix with retry behavior suitable for CI.

CI-friendly report output is written to:
- `output/playwright/report`
- `output/playwright/reports/results.json`
- `output/playwright/reports/junit.xml`
- `output/playwright/artifacts` (videos/traces/screenshots on failures)

Quick pre-merge command:
```bash
npm run test:e2e:critical && npm run test:e2e:smoke
```

### 🦑 Secure Clawdbot

```bash
cd clawd
npm install
node cli.js
```

Select "Terminal chat" to test, or "Start gateway" to connect WhatsApp/Telegram/Signal/iMessage.

See [Secure Clawdbot Documentation](./clawd/README.md) for full setup.

---

## Features

### Open Claude Cowork
- **AI Provider** - Claude Agent SDK
- **Persistent Sessions** - Context maintained across messages
- **Real-time Streaming** - Token-by-token response display
- **Tool Visualization** - See tool inputs/outputs in the sidebar
- **Skills Support** - Extend Claude with custom capabilities
- **Modern UI** - Clean, dark-themed interface

### 🦑 Secure Clawdbot
- **Multi-Platform** - WhatsApp, Telegram, Signal, iMessage
- **Persistent Memory** - Remembers facts, preferences, daily notes
- **Browser Automation** - Navigate, click, fill forms, screenshot
- **Scheduling** - Natural language reminders and cron jobs
- **500+ Integrations** - Gmail, Slack, GitHub, Calendar via Composio

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop | Electron.js |
| Backend | Node.js + Express |
| AI | Claude Agent SDK |
| Tools | Composio Tool Router + MCP |
| Streaming | Server-Sent Events (SSE) |

---

## Configuration

### API Keys

You need:
- **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com)
- **Composio API key** from [app.composio.dev](https://app.composio.dev)
- **OpenAI API key** (optional) from [platform.openai.com](https://platform.openai.com) for memory/search

```bash
cp .env.example .env
# Edit .env with your keys
```

### Skills

Extend Claude with custom skills by adding `SKILL.md` files to `.claude/skills/`:

```markdown
---
description: Use this skill when the user asks about [topic]
---

# My Skill

Instructions for Claude...
```

See [Agent Skills documentation](https://platform.claude.com/docs/en/agent-sdk/skills) for details.

---

## Project Structure

```
open-claude-cowork/
├── main.js              # Electron main process
├── renderer/            # Frontend UI
├── server/              # Backend + providers
│   ├── providers/       # Claude implementation
│   └── server.js        # Express server
├── clawd/               # Secure Clawdbot (messaging bot)
│   ├── cli.js           # Entry point
│   ├── adapters/        # WhatsApp, Telegram, Signal, iMessage
│   └── README.md        # Full documentation
└── .claude/skills/      # Custom agent skills
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't connect to backend | Ensure server is running on port 3001 |
| API key error | Check `.env` - Anthropic keys start with `sk-ant-` |
| Session not persisting | Check server logs for session ID |
| Streaming slow | Check firewall/network for SSE connections |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Resources

- [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-agent-sdk)
- [Composio Tool Router](https://docs.composio.dev/tool-router)
- [Composio Dashboard](https://app.composio.dev)
- [Electron Docs](https://www.electronjs.org/docs)

---

## Community

- [Discord](https://discord.com/invite/composio) - Chat with developers
- [Twitter/X](https://x.com/composio) - Updates and features
- [support@composio.dev](mailto:support@composio.dev) - Questions

---

<p align="center">
  <b>Join 200,000+ developers building agents in production</b>
</p>

<p align="center">
  <a href="https://platform.composio.dev/?utm_source=github&utm_medium=community&utm_campaign=2101&utm_content=open claude cowork">
    <img src="https://img.shields.io/badge/Get_Started_For_Free-4F46E5?style=for-the-badge" alt="Get Started For Free"/>
  </a>
</p>

<p align="center">
  Built with Claude Code and Composio
</p>
