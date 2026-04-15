---
name: tell-colleen
description: Use when the user wants to contact Colleen (product owner), report bugs, request features, send praise, or escalate to a human. Essential for Andy the Analyst when users ask to reach a person or leave feedback outside normal analysis work.
---

# Tell Colleen

## Overview

**Tell Colleen** sends the user's message to Colleen as a **GitHub Issue** in the configured repo (requires `GITHUB_TOKEN` on the server). It mirrors the KangAIrooski Travel Agent behavior: transparent feedback with category labels.

**Keywords**: feedback, bug report, feature request, contact human, escalate, tell Colleen, message Colleen, GitHub issue, product owner

## When to use

- The user asks to **talk to a person**, **contact the team**, or **message Colleen**.
- They want to **report a bug**, **suggest a feature**, or send **general feedback** about kangAIrooski / Open Claude Cowork.
- After analysis work, they ask you to **pass something along** to Colleen.

## When not to use

- Routine data questions, spreadsheet tasks, or clarifications you can complete yourself.
- Do not send without the user's **clear consent** on the exact message text (and category).

## Categories

Use one of these `category` values in the API request:

| Value | Use for |
|--------|---------|
| `bug` | Something broken or incorrect |
| `feature-request` | New capability or improvement |
| `feedback` | General product feedback (including positive) |
| `question` | Question for Colleen specifically |
| `general` | Default when nothing else fits |

## Workflow (Andy-style)

1. **Confirm** the user's wording (or offer a concise draft they approve).
2. **Confirm category** (default `general` if they do not care).
3. **Submit** via the local HTTP API below so the server creates the GitHub issue.

## API

- **Method:** `POST`
- **URL:** `http://127.0.0.1:3001/api/tell-colleen` (use the app's server port if different, e.g. `PORT` in `.env`).
- **Body (JSON):**
  - `message` (string, required)
  - `category` (string, optional; default `general`)
  - `user_name` (string, optional)
  - `user_email` (string, optional)

## How to submit (Bash tool)

Use a small Python snippet so JSON is escaped safely. Replace the message, category, and optional name/email:

```bash
python3 << 'PY'
import json
import urllib.request

payload = {
    "message": "User-approved message text here.",
    "category": "general",
    "user_name": None,
    "user_email": None,
}
req = urllib.request.Request(
    "http://127.0.0.1:3001/api/tell-colleen",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as resp:
    print(resp.read().decode())
PY
```

If the response includes `"status": "sent"`, tell the user the issue was filed and share the `issue_url` if present. If `"status": "error"`, explain briefly (e.g. GitHub not configured on the server) and suggest they retry after configuration or share feedback another way.

## Tone

Keep Colleen-facing copy **clear and respectful**. One issue per distinct topic when possible.
