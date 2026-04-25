"""FastAPI backend — SSE chat, Composio MCP, Claude / OpenCode providers."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from composio import Composio
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from server.providers import get_available_providers, get_provider, initialize_providers
from server.tell_colleen import submit_feedback_to_github
from server.whatsapp_meta import extract_inbound_text_messages, safe_json_dict, verify_meta_webhook_signature
from server.whatsapp_reply import reply_to_whatsapp_inbound

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent

load_dotenv(REPO_ROOT / ".env")

PORT = int(os.environ.get("PORT", "3001"))
HOST = os.environ.get("HOST", "127.0.0.1")

composio_client: Composio | None = None
composio_sessions: dict[str, Any] = {}
default_composio_session: Any = None


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


def update_opencode_config(mcp_url: str, mcp_headers: dict[str, str]) -> None:
    path = SERVER_DIR / "opencode.json"
    config = {"mcp": {"composio": {"type": "remote", "url": mcp_url, "headers": mcp_headers}}}
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")


def initialize_composio_session() -> None:
    global default_composio_session, composio_client
    assert composio_client is not None
    uid = "default-user"
    logger.info("[COMPOSIO] Pre-initializing session for: %s", uid)
    try:
        default_composio_session = composio_client.create(user_id=uid)
        composio_sessions[uid] = default_composio_session
        url, hdrs = _mcp_url_headers(default_composio_session)
        logger.info("[COMPOSIO] Session ready with MCP URL: %s", url)
        update_opencode_config(url, hdrs)
        logger.info("[OPENCODE] Updated opencode.json with MCP config")
    except Exception as e:
        logger.error("[COMPOSIO] Failed to pre-initialize session: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global composio_client
    composio_client = Composio()
    await initialize_providers()
    await asyncio.to_thread(initialize_composio_session)
    yield
    try:
        op = get_provider("opencode")
        await op.cleanup()
    except Exception as e:
        logger.warning("OpenCode cleanup: %s", e)


app = FastAPI(title="Open KangAIrooski", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatBody(BaseModel):
    message: str
    chatId: str | None = None
    userId: str = "default-user"
    provider: str = "claude"
    model: str | None = None


class AbortBody(BaseModel):
    chatId: str
    provider: str = "claude"


class TellColleenBody(BaseModel):
    message: str
    category: str = "general"
    user_name: str | None = None
    user_email: str | None = None


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


@app.post("/api/chat")
async def chat(body: ChatBody):
    if not body.message.strip():
        return JSONResponse({"error": "Message is required"}, status_code=400)

    available = get_available_providers()
    pname = body.provider.lower()
    if pname not in available:
        return JSONResponse(
            {"error": f"Invalid provider: {body.provider}. Available: {', '.join(available)}"},
            status_code=400,
        )

    logger.info("[CHAT] Request received: %s", body.message[:120])
    logger.info("[CHAT] Chat ID: %s", body.chatId)
    logger.info("[CHAT] Provider: %s", pname)
    logger.info("[CHAT] Model: %s", body.model or "(default)")

    async def event_stream():
        global composio_client
        assert composio_client is not None

        yield _sse({"type": "connected", "message": "Processing request..."})

        last_beat = time.monotonic()

        def maybe_heartbeat() -> str | None:
            nonlocal last_beat
            now = time.monotonic()
            if now - last_beat >= 15:
                last_beat = now
                return ": heartbeat\n\n"
            return None

        try:
            user_id = body.userId
            session = composio_sessions.get(user_id)
            if not session:
                logger.info("[COMPOSIO] Creating new session for user: %s", user_id)
                yield _sse({"type": "status", "message": "Initializing session..."})

                def _create():
                    return composio_client.create(user_id=user_id)

                session = await asyncio.to_thread(_create)
                composio_sessions[user_id] = session
                url, hdrs = _mcp_url_headers(session)
                logger.info("[COMPOSIO] Session created with MCP URL: %s", url)
                await asyncio.to_thread(update_opencode_config, url, hdrs)
                logger.info("[OPENCODE] Updated opencode.json with MCP config")

            url, hdrs = _mcp_url_headers(session)
            mcp_servers = {"composio": {"type": "http", "url": url, "headers": hdrs}}

            provider = get_provider(pname)
            logger.info("[CHAT] Using provider: %s", provider.name)
            logger.info("[CHAT] All stored sessions: %s", list(provider.sessions.items()))

            params = {
                "prompt": body.message,
                "chatId": body.chatId,
                "userId": user_id,
                "mcpServers": mcp_servers,
                "model": body.model,
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
                "max_turns": 100,
            }

            try:
                async for chunk in provider.query(params):
                    hb = maybe_heartbeat()
                    if hb:
                        yield hb
                    yield _sse(chunk)
                    last_beat = time.monotonic()
            except Exception as stream_err:
                logger.error("[CHAT] Stream error during iteration: %s", stream_err)
                yield _sse({"type": "error", "message": str(stream_err)})

        except Exception as e:
            logger.error("[CHAT] Error: %s", e)
            yield _sse({"type": "error", "message": str(e)})

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@app.post("/api/abort")
async def abort(body: AbortBody):
    if not body.chatId:
        return JSONResponse({"error": "chatId is required"}, status_code=400)
    logger.info("[ABORT] Request to abort chatId: %s provider: %s", body.chatId, body.provider)
    try:
        provider = get_provider(body.provider)
        aborted = provider.abort(body.chatId)
        if aborted:
            logger.info("[ABORT] Successfully aborted chatId: %s", body.chatId)
            return {"success": True, "message": "Query aborted"}
        logger.info("[ABORT] No active query found for chatId: %s", body.chatId)
        return {"success": False, "message": "No active query to abort"}
    except Exception as e:
        logger.error("[ABORT] Error: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/providers")
async def providers():
    return {"providers": get_available_providers(), "default": "claude"}


@app.post("/api/tell-colleen")
async def tell_colleen(body: TellColleenBody):
    """Submit feedback to Colleen via GitHub Issues (Tell Colleen)."""
    if not body.message.strip():
        return JSONResponse({"error": "message is required"}, status_code=400)
    result = await submit_feedback_to_github(
        body.message.strip(),
        category=body.category,
        user_name=body.user_name,
        user_email=body.user_email,
    )
    status_code = 200 if result.get("status") == "sent" else 503
    return JSONResponse(result, status_code=status_code)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "providers": get_available_providers(),
    }


@app.get("/webhooks/meta/whatsapp")
async def meta_whatsapp_verify(request: Request):
    """Meta WhatsApp Cloud API webhook verification (GET)."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    expected = os.environ.get("META_WEBHOOK_VERIFY_TOKEN", "")
    if mode == "subscribe" and token and expected and token == expected and challenge:
        return PlainTextResponse(challenge)
    return JSONResponse({"error": "Forbidden"}, status_code=403)


@app.post("/webhooks/meta/whatsapp")
async def meta_whatsapp_inbound(request: Request):
    """Meta WhatsApp Cloud API inbound messages (POST)."""
    raw = await request.body()
    app_secret = os.environ.get("META_APP_SECRET", "")
    allow_unsigned = os.environ.get("META_WEBHOOK_ALLOW_UNSIGNED", "").lower() in ("1", "true", "yes")
    sig = request.headers.get("X-Hub-Signature-256")
    if app_secret and not allow_unsigned:
        if not verify_meta_webhook_signature(app_secret, raw, sig):
            logger.warning("[META-WA] Invalid webhook signature")
            return JSONResponse({"error": "invalid signature"}, status_code=403)
    elif not app_secret and not allow_unsigned:
        logger.warning(
            "[META-WA] META_APP_SECRET not set; rejecting POST "
            "(set META_APP_SECRET or META_WEBHOOK_ALLOW_UNSIGNED=1 for local dev only)"
        )
        return JSONResponse({"error": "META_APP_SECRET not configured"}, status_code=503)

    payload = safe_json_dict(raw)
    if not payload:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    default_phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    connected_account_id = os.environ.get("WHATSAPP_COMPOSIO_CONNECTED_ACCOUNT_ID") or None

    messages = extract_inbound_text_messages(payload)
    if not messages:
        return {"success": True, "handled": 0}

    for m in messages:
        from_number = m["from"]
        text = m["text"]
        msg_id = m.get("message_id")
        phone_number_id = m.get("phone_number_id") or default_phone_number_id
        if not phone_number_id:
            logger.error("[META-WA] Missing phone_number_id on message and WHATSAPP_PHONE_NUMBER_ID unset")
            continue

        async def _run(
            fn: str = from_number,
            tx: str = text,
            mid: str | None = msg_id,
            pid: str = phone_number_id,
            caid: str | None = connected_account_id,
        ) -> None:
            global composio_client
            assert composio_client is not None
            try:
                await reply_to_whatsapp_inbound(
                    composio_client=composio_client,
                    composio_sessions=composio_sessions,
                    from_number=fn,
                    inbound_text=tx,
                    message_id=mid,
                    phone_number_id=pid,
                    connected_account_id=caid,
                )
            except Exception as e:
                logger.exception("[META-WA] Reply task failed: %s", e)

        asyncio.create_task(_run())

    return {"success": True, "queued": len(messages)}


@app.post("/webhooks/composio")
async def composio_org_webhook(request: Request):
    """Composio org webhook (trigger events). Verifies signature when COMPOSIO_WEBHOOK_SECRET is set."""
    global composio_client
    raw = await request.body()
    text_body = raw.decode("utf-8")
    secret = os.environ.get("COMPOSIO_WEBHOOK_SECRET", "")
    if secret:
        if composio_client is None:
            return JSONResponse({"error": "server not ready"}, status_code=503)
        try:
            composio_client.triggers.verify_webhook(
                id=request.headers.get("webhook-id", ""),
                payload=text_body,
                signature=request.headers.get("webhook-signature", ""),
                timestamp=request.headers.get("webhook-timestamp", ""),
                secret=secret,
            )
        except Exception as e:
            logger.warning("[COMPOSIO-WEBHOOK] Signature verify failed: %s", e)
            return JSONResponse({"error": "invalid signature"}, status_code=403)

    try:
        payload = json.loads(text_body)
    except json.JSONDecodeError:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    logger.info(
        "[COMPOSIO-WEBHOOK] event type=%s trigger=%s",
        payload.get("type"),
        (payload.get("metadata") or {}).get("trigger_slug"),
    )
    return {"success": True}


def main() -> None:
    import uvicorn

    uvicorn.run(
        "server.app:app",
        host=HOST,
        port=PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
