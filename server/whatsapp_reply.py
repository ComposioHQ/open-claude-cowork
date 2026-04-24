"""Generate an Andy reply for WhatsApp inbound, then send via Composio WHATSAPP_SEND_MESSAGE."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from server.providers import get_provider

logger = logging.getLogger(__name__)


def _mcp_url_headers(session: Any) -> tuple[str, dict[str, str]]:
    mcp = session.mcp
    url = getattr(mcp, "url", None) if mcp is not None else None
    headers = getattr(mcp, "headers", None) if mcp is not None else None
    if url is None and isinstance(mcp, dict):
        url = mcp.get("url")
        headers = mcp.get("headers")
    if not url:
        raise RuntimeError("Composio session has no MCP URL")
    raw_hdrs = dict(headers) if isinstance(headers, dict) else {}
    hdrs = {str(k): str(v) for k, v in raw_hdrs.items()}
    return str(url), hdrs


def _tool_execute(
    composio_client: Any,
    slug: str,
    arguments: dict[str, Any],
    *,
    user_id: str,
    connected_account_id: str | None,
) -> Any:
    return composio_client.tools.execute(
        slug,
        arguments,
        user_id=user_id,
        connected_account_id=connected_account_id,
    )


async def reply_to_whatsapp_inbound(
    *,
    composio_client: Any,
    composio_sessions: dict[str, Any],
    from_number: str,
    inbound_text: str,
    message_id: str | None,
    phone_number_id: str,
    connected_account_id: str | None,
) -> None:
    """
    One WhatsApp user = one Composio session key `wa-<digits>` (matches phone without +).
    Runs Claude with Composio MCP, collects assistant text, sends WhatsApp reply.
    """
    user_id = f"wa-{from_number}"
    session = composio_sessions.get(user_id)
    if not session:

        def _create() -> Any:
            return composio_client.create(user_id=user_id)

        session = await asyncio.to_thread(_create)
        composio_sessions[user_id] = session

    url, hdrs = _mcp_url_headers(session)
    mcp_servers: dict[str, Any] = {"composio": {"type": "http", "url": url, "headers": hdrs}}

    provider = get_provider("claude")
    prompt = (
        "You are Andy the Analyst replying on WhatsApp. Be concise and mobile-friendly.\n"
        f"The user's WhatsApp number (no +) is: {from_number}\n\n"
        f"They sent:\n{inbound_text}"
    )

    text_parts: list[str] = []
    params = {
        "prompt": prompt,
        "chatId": user_id,
        "userId": user_id,
        "mcpServers": mcp_servers,
        "model": None,
        "allowed_tools": [
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "WebSearch",
            "WebFetch",
            "TodoWrite",
            "Skill",
        ],
        "max_turns": 50,
    }

    async for chunk in provider.query(params):
        if isinstance(chunk, dict) and chunk.get("type") == "text":
            c = chunk.get("content")
            if isinstance(c, str) and c:
                text_parts.append(c)

    reply = "".join(text_parts).strip()
    if not reply:
        reply = "Got it — I'm here. Ask me anything in a short message and I'll help."

    args: dict[str, Any] = {
        "text": reply[:4090],
        "to_number": from_number,
        "phone_number_id": phone_number_id,
    }
    if message_id:
        args["message_id"] = message_id

    logger.info("[META-WA] Sending reply to %s via WHATSAPP_SEND_MESSAGE", from_number)

    def _send() -> Any:
        return _tool_execute(
            composio_client,
            "WHATSAPP_SEND_MESSAGE",
            args,
            user_id=user_id,
            connected_account_id=connected_account_id,
        )

    result = await asyncio.to_thread(_send)
    logger.info("[META-WA] Send result: %s", result)
