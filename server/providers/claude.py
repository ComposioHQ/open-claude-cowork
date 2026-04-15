"""Claude Agent SDK provider — streams normalized chunks for the Electron UI."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    StreamEvent,
    SystemMessage,
    UserMessage,
    query,
)
from claude_agent_sdk.types import (
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
)

from .base import BaseProvider

logger = logging.getLogger(__name__)


def _session_id_from_init(data: dict[str, Any]) -> str | None:
    """Get the session ID from the init event data.

    Args:
        data: The event data.

    Returns:
        The session ID.

    """
    if not isinstance(data, dict):
        return None
    sid = data.get("session_id") or data.get("sessionId")
    if sid:
        return sid
    inner = data.get("data")
    if isinstance(inner, dict):
        return inner.get("session_id") or inner.get("sessionId")
    return None


def _chunks_from_stream_event(se: StreamEvent) -> list[dict[str, Any]]:
    """Get the chunks from the stream event.

    Args:
        se: The stream event.

    Returns:
        The chunks.
    """
    ev = se.event
    out: list[dict[str, Any]] = []
    t = ev.get("type")
    if t == "content_block_delta":
        delta = ev.get("delta") or {}
        dt = delta.get("type")
        if dt == "text_delta" and delta.get("text"):
            out.append({"type": "text", "content": delta["text"], "provider": "claude"})
        elif dt == "thinking_delta" and delta.get("thinking"):
            out.append(
                {
                    "type": "text",
                    "content": delta["thinking"],
                    "provider": "claude",
                    "isReasoning": True,
                }
            )
    return out


def _normalize_message(msg: Any, provider_name: str) -> list[dict[str, Any]]:
    """Normalize the message to a list of chunks.

    Args:
        msg: The message.
        provider_name: The name of the provider.

    Returns:
        The list of chunks.
    """
    chunks: list[dict[str, Any]] = []

    if isinstance(msg, SystemMessage):
        # init is handled in query() so we emit session_init once and capture session id
        return chunks

    if isinstance(msg, AssistantMessage):
        for block in msg.content:
            if isinstance(block, TextBlock) and block.text:
                chunks.append(
                    {"type": "text", "content": block.text, "provider": provider_name}
                )
            elif isinstance(block, ThinkingBlock) and block.thinking:
                chunks.append(
                    {
                        "type": "text",
                        "content": block.thinking,
                        "provider": provider_name,
                        "isReasoning": True,
                    }
                )
            elif isinstance(block, ToolUseBlock):
                chunks.append(
                    {
                        "type": "tool_use",
                        "name": block.name,
                        "input": block.input,
                        "id": block.id,
                        "provider": provider_name,
                    }
                )
            elif isinstance(block, ToolResultBlock):
                chunks.append(
                    {
                        "type": "tool_result",
                        "result": block.content,
                        "tool_use_id": block.tool_use_id,
                        "provider": provider_name,
                    }
                )
        return chunks

    if isinstance(msg, UserMessage):
        content = msg.content
        if isinstance(content, list):
            for block in content:
                if isinstance(block, TextBlock) and block.text:
                    chunks.append(
                        {
                            "type": "text",
                            "content": block.text,
                            "provider": provider_name,
                        }
                    )
                elif isinstance(block, ToolUseBlock):
                    chunks.append(
                        {
                            "type": "tool_use",
                            "name": block.name,
                            "input": block.input,
                            "id": block.id,
                            "provider": provider_name,
                        }
                    )
                elif isinstance(block, ToolResultBlock):
                    chunks.append(
                        {
                            "type": "tool_result",
                            "result": block.content,
                            "tool_use_id": block.tool_use_id,
                            "provider": provider_name,
                        }
                    )
        return chunks

    if isinstance(msg, StreamEvent):
        return _chunks_from_stream_event(msg)

    if isinstance(msg, ResultMessage):
        # End-of-turn metadata; UI already shows content from assistant chunks
        return []

    return []


class ClaudeProvider(BaseProvider):
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.default_allowed_tools: list[str] = config.get(
            "allowed_tools",
            [
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
        )
        self.default_max_turns: int = config.get("max_turns", 20)
        self.permission_mode: str = config.get("permission_mode", "bypassPermissions")
        self._abort_events: dict[str, asyncio.Event] = {}

    @property
    def name(self) -> str:
        return "claude"

    def abort(self, chat_id: str) -> bool:
        ev = self._abort_events.get(chat_id)
        if ev:
            ev.set()
            logger.info("[Claude] Abort requested for chatId: %s", chat_id)
            return True
        return False

    async def query(self, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        prompt: str = params["prompt"]
        chat_id: str | None = params.get("chatId") or params.get("chat_id")
        mcp_servers: dict[str, Any] = (
            params.get("mcpServers") or params.get("mcp_servers") or {}
        )
        allowed_tools: list[str] = (
            params.get("allowed_tools") or self.default_allowed_tools
        )
        max_turns: int = int(params.get("max_turns") or self.default_max_turns)

        if chat_id:
            self._abort_events[chat_id] = asyncio.Event()

        try:
            options_kwargs: dict[str, Any] = {
                "allowed_tools": allowed_tools,
                "max_turns": max_turns,
                "mcp_servers": mcp_servers,
                "permission_mode": self.permission_mode,  # type: ignore[arg-type]
                "setting_sources": ["user", "project"],
                # Partial stream events can duplicate final AssistantMessage text in the UI
                "include_partial_messages": False,
            }
            # Intentionally ignore frontend model IDs here.
            # Claude Code SDK model naming differs from the UI values and can crash the CLI.

            existing = self.get_session(chat_id) if chat_id else None
            if existing:
                options_kwargs["resume"] = existing
                logger.info("[Claude] Resuming session: %s", existing)

            options = ClaudeAgentOptions(
                **options_kwargs,
                stderr=lambda line: logger.error("[Claude SDK] %s", line.rstrip()),
            )

            logger.info("[Claude] Calling Claude Agent SDK...")

            async for msg in query(prompt=prompt, options=options):
                if (
                    chat_id
                    and self._abort_events.get(chat_id)
                    and self._abort_events[chat_id].is_set()
                ):
                    logger.info("[Claude] Query aborted for chatId: %s", chat_id)
                    yield {"type": "aborted", "provider": self.name}
                    return

                if isinstance(msg, SystemMessage) and msg.subtype == "init":
                    sid = _session_id_from_init(msg.data)
                    if sid and chat_id:
                        self.set_session(chat_id, sid)
                        logger.info("[Claude] Session ID captured: %s", sid)
                    if sid:
                        yield {
                            "type": "session_init",
                            "session_id": sid,
                            "provider": self.name,
                        }
                    continue

                for chunk in _normalize_message(msg, self.name):
                    yield chunk

            yield {"type": "done", "provider": self.name}
            logger.info("[Claude] Stream completed")
        except asyncio.CancelledError:
            logger.info("[Claude] Query cancelled for chatId: %s", chat_id)
            yield {"type": "aborted", "provider": self.name}
            raise
        except Exception as e:
            logger.exception("[Claude] Stream error: %s", e)
            yield {"type": "error", "message": str(e), "provider": self.name}
        finally:
            if chat_id:
                self._abort_events.pop(chat_id, None)
