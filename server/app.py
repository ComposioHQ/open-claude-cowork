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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from server.providers import get_available_providers, get_provider, initialize_providers
from server.tell_colleen import submit_feedback_to_github

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent

load_dotenv(REPO_ROOT / ".env")

PORT = int(os.environ.get("PORT", "3001"))

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


def main() -> None:
    import uvicorn

    uvicorn.run(
        "server.app:app",
        host="127.0.0.1",
        port=PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
