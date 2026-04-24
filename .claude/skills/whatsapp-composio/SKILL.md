---
name: whatsapp-composio
description: Use when the user wants to send WhatsApp messages, test mobile delivery, or integrate WhatsApp through Composio from Andy.
---

# WhatsApp via Composio

## Purpose

Enable Andy to send WhatsApp messages through Composio-connected tools with clear confirmation and safe execution.

## When to use

- User asks to "integrate WhatsApp", "send on WhatsApp", or "test on mobile".
- User wants Andy to notify people via WhatsApp from workflows.

## Required setup

Before first use, ensure Composio account/app connection exists for WhatsApp:

1. `composio login`
2. `composio link whatsapp`

If linking requires browser authorization, complete it and return to the app.

## Full two-way (inbound texts → Andy replies)

Composio’s WhatsApp toolkit trigger list is limited for **true inbound chat**; reliable two-way uses **Meta WhatsApp Cloud API webhooks** into this app, then **Composio `WHATSAPP_SEND_MESSAGE`** for the reply.

### 1) Expose your server publicly

Run backend with a public host (deploy or tunnel), for example:

- `HOST=0.0.0.0 PORT=3001 npm run server` (then tunnel `3001` to HTTPS)

### 2) Meta Developer configuration

In Meta WhatsApp Cloud API settings, set **Callback URL** to:

- `https://<your-public-host>/webhooks/meta/whatsapp`

**Verify token** must match `META_WEBHOOK_VERIFY_TOKEN` in `.env`.

Subscribe to **`messages`** (and usually **`message_echoes`** only if you need them).

### 3) App environment variables

Set in `.env` (names only — do not commit real secrets):

- `META_APP_SECRET` — used to verify `X-Hub-Signature-256` on POST
- `META_WEBHOOK_VERIFY_TOKEN` — must match Meta “Verify token”
- `WHATSAPP_PHONE_NUMBER_ID` — Meta numeric sender id (fallback if webhook metadata omits it)
- `WHATSAPP_COMPOSIO_CONNECTED_ACCOUNT_ID` — optional; Composio connected account id for WhatsApp if required by your org

**Local dev only (insecure):** `META_WEBHOOK_ALLOW_UNSIGNED=1` skips signature verification — never use in production.

### 4) Composio org webhooks (optional)

Subscribe to `composio.trigger.message` at:

- `https://<your-public-host>/webhooks/composio`

Set `COMPOSIO_WEBHOOK_SECRET` from the subscription response for signature verification.

## Operating rules

- Always ask for explicit confirmation before sending:
  - recipient
  - message text
  - whether this is a one-time test or repeat workflow
- Keep messages short and clear.
- Never send messages silently.

## Execution flow

1. Confirm intent and collect:
   - recipient phone (with country code)
   - message body
2. Validate tool availability through Composio.
3. Execute the WhatsApp send action.
4. Report success/failure with any returned message id/status.

## Validation / troubleshooting

If WhatsApp send fails:

- Re-check account connection (`composio link whatsapp`).
- Confirm recipient number format includes country code.
- Confirm WhatsApp toolkit/tool access is available in the active org/project.
- Surface the exact error and suggest the next fix.

## Example user-facing confirmation

"I can send this on WhatsApp via Composio. Confirm I should send to +1XXXXXXXXXX:
'Hi! This is Andy testing the mobile workflow.'"
