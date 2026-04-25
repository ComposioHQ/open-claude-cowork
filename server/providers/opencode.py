"""OpenCode HTTP/SSE provider — talks to the `opencode serve` local API."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .base import BaseProvider

logger = logging.getLogger(__name__)

LISTENING_RE = re.compile(r"on\s+(https?://[^\s]+)")


async def _parse_sse_stream(response: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    """Yield parsed JSON events from an SSE response body."""
    buffer = ""
    async for chunk in response.aiter_text():
        buffer += chunk
        parts = buffer.split("\n\n")
        buffer = parts.pop() or ""
        for block in parts:
            data_lines: list[str] = []
            for line in block.split("\n"):
                if line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
            if not data_lines:
                continue
            raw = "\n".join(data_lines)
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                logger.debug("[Opencode] Non-JSON SSE payload: %s", raw[:200])


class OpencodeProvider(BaseProvider):
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.default_model: str | None = config.get("model") if config else None
        self.hostname: str = (config or {}).get("hostname", "127.0.0.1")
        self.port: int = int((config or {}).get("port", 4096))
        self.use_existing_server: bool = (config or {}).get("use_existing_server", False)
        self.existing_server_url: str | None = (config or {}).get("existing_server_url")
        self.base_url: str | None = self.existing_server_url if self.use_existing_server else None
        self._process: asyncio.subprocess.Process | None = None
        self._abort_flags: dict[str, asyncio.Event] = {}

    @property
    def name(self) -> str:
        return "opencode"

    def abort(self, chat_id: str) -> bool:
        ev = self._abort_flags.get(chat_id)
        if ev:
            ev.set()
            logger.info("[Opencode] Abort flag set for chatId: %s", chat_id)
            return True
        return False

    async def initialize(self) -> None:
        if self.base_url:
            return
        if self._process and self._process.returncode is None:
            return

        server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        config_path = os.path.join(server_dir, "opencode.json")
        config_obj: dict[str, Any] = {}
        if os.path.isfile(config_path):
            try:
                with open(config_path, encoding="utf-8") as f:
                    config_obj = json.load(f)
            except OSError as e:
                logger.warning("[Opencode] Could not read opencode.json: %s", e)

        env = {**os.environ, "OPENCODE_CONFIG_CONTENT": json.dumps(config_obj)}

        proc = await asyncio.create_subprocess_exec(
            "opencode",
            "serve",
            f"--hostname={self.hostname}",
            f"--port={self.port}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        self._process = proc
        assert proc.stdout is not None

        url: str | None = None
        buf = ""

        async def _wait_for_listen() -> str:
            nonlocal buf
            while True:
                line_b = await proc.stdout.readline()
                if not line_b:
                    break
                line = line_b.decode(errors="replace")
                buf += line
                if line.startswith("opencode server listening"):
                    m = LISTENING_RE.search(line)
                    if m:
                        return m.group(1)
                if proc.returncode is not None:
                    raise RuntimeError(f"OpenCode server exited early: {buf.strip()}")
            raise RuntimeError(f"OpenCode server stopped before ready. Output:\n{buf.strip()}")

        try:
            url = await asyncio.wait_for(_wait_for_listen(), timeout=30.0)
        except TimeoutError as e:
            raise RuntimeError(
                f"Timeout waiting for OpenCode server (30s). Output so far:\n{buf.strip()}",
            ) from e

        if not url:
            raise RuntimeError(f"Failed to parse OpenCode server URL. Output:\n{buf.strip()}")

        self.base_url = url.rstrip("/")
        logger.info("[Opencode] Server at %s", self.base_url)

    async def cleanup(self) -> None:
        await super().cleanup()
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except TimeoutError:
                self._process.kill()
        self._process = None
        if not self.use_existing_server:
            self.base_url = None

    async def query(self, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        prompt: str = params["prompt"]
        chat_id: str | None = params.get("chatId") or params.get("chat_id")
        model: str | None = params.get("model")
        model_to_use = model or self.default_model or "opencode/big-pickle"

        if chat_id:
            self._abort_flags[chat_id] = asyncio.Event()

        await self.initialize()
        assert self.base_url is not None

        client_timeout = httpx.Timeout(connect=30.0, read=600.0, write=30.0, pool=30.0)

        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=client_timeout) as client:
                session_id = self.get_session(chat_id) if chat_id else None

                if not session_id:
                    logger.info("[Opencode] Creating session with model: %s", model_to_use)
                    r = await client.post("/session", json={"config": {"model": model_to_use}})
                    r.raise_for_status()
                    body = r.json()
                    session_id = body.get("id") or (body.get("data") or {}).get("id")
                    if not session_id:
                        raise RuntimeError(f"OpenCode session create returned no id: {body}")
                    if chat_id:
                        self.set_session(chat_id, session_id)
                    logger.info("[Opencode] Session: %s", session_id)
                    yield {"type": "session_init", "session_id": session_id, "provider": self.name}

                provider_id, *model_rest = model_to_use.split("/")
                model_id = "/".join(model_rest) if model_rest else model_to_use

                async with client.stream("GET", "/global/event") as event_response:
                    event_response.raise_for_status()

                    pr = await client.post(
                        f"/session/{session_id}/prompt_async",
                        json={
                            "model": {"providerID": provider_id, "modelID": model_id},
                            "parts": [{"type": "text", "text": prompt}],
                        },
                    )
                    pr.raise_for_status()

                    user_message_id: str | None = None
                    last_yielded_length: dict[str, int] = {}
                    yielded_tool_calls: set[str] = set()

                    async for event in _parse_sse_stream(event_response):
                        if chat_id and self._abort_flags.get(chat_id) and self._abort_flags[chat_id].is_set():
                            try:
                                await client.post(f"/session/{session_id}/abort")
                            except httpx.HTTPError as e:
                                logger.warning("[Opencode] Abort request failed: %s", e)
                            yield {"type": "aborted", "provider": self.name}
                            return

                        props = event.get("properties") or {}
                        part = props.get("part") or props
                        event_session_id = (
                            props.get("sessionID") or part.get("sessionID") or (props.get("session") or {}).get("id")
                        )
                        if event_session_id and event_session_id != session_id:
                            continue

                        et = event.get("type")
                        if et == "message.part.updated":
                            message_id = part.get("messageID")
                            part_id = part.get("id")

                            if not user_message_id and part.get("type") == "text":
                                user_message_id = message_id
                                continue
                            if message_id == user_message_id:
                                continue

                            pt = part.get("type")
                            if pt == "text" and part.get("text"):
                                full_text = part["text"]
                                prev = last_yielded_length.get(part_id, 0)
                                if len(full_text) > prev:
                                    delta = full_text[prev:]
                                    yield {"type": "text", "content": delta, "provider": self.name}
                                    last_yielded_length[part_id] = len(full_text)
                            elif pt == "reasoning":
                                text = part.get("reasoning") or part.get("text") or ""
                                prev = last_yielded_length.get(part_id, 0)
                                if len(text) > prev:
                                    delta = text[prev:]
                                    yield {
                                        "type": "text",
                                        "content": delta,
                                        "provider": self.name,
                                        "isReasoning": True,
                                    }
                                    last_yielded_length[part_id] = len(text)
                            elif pt in ("tool-invocation", "tool_invocation", "tool"):
                                tool_id = (
                                    part.get("toolInvocationId")
                                    or part.get("callID")
                                    or part.get("id")
                                    or part.get("tool_invocation_id")
                                )
                                if not tool_id or tool_id in yielded_tool_calls:
                                    continue
                                state = part.get("state") or {}
                                if state.get("status") == "pending":
                                    continue
                                tool_name = part.get("toolName") or part.get("tool") or part.get("name")
                                tool_args = (
                                    state.get("input")
                                    or part.get("args")
                                    or part.get("input")
                                    or part.get("parameters")
                                    or part.get("params")
                                    or part.get("toolInput")
                                    or {}
                                )
                                yielded_tool_calls.add(tool_id)
                                yield {
                                    "type": "tool_use",
                                    "name": tool_name,
                                    "input": tool_args,
                                    "id": tool_id,
                                    "provider": self.name,
                                }
                            elif pt in ("tool-result", "tool_result"):
                                tool_id = (
                                    part.get("toolInvocationId")
                                    or part.get("callID")
                                    or part.get("id")
                                    or part.get("tool_invocation_id")
                                )
                                result_data = part.get("result") or part.get("output") or part.get("content")
                                yield {
                                    "type": "tool_result",
                                    "result": result_data,
                                    "tool_use_id": tool_id,
                                    "provider": self.name,
                                }
                        elif et == "session.idle":
                            break
                        elif et == "session.error":
                            yield {
                                "type": "error",
                                "message": props.get("message") or "Session error",
                                "provider": self.name,
                            }
                            break

                if chat_id and self._abort_flags.get(chat_id) and self._abort_flags[chat_id].is_set():
                    yield {"type": "aborted", "provider": self.name}
                else:
                    yield {"type": "done", "provider": self.name}
                logger.info("[Opencode] Stream completed")

        except asyncio.CancelledError:
            yield {"type": "aborted", "provider": self.name}
            raise
        except Exception as e:
            logger.exception("[Opencode] Query error: %s", e)
            yield {"type": "error", "message": str(e), "provider": self.name}
        finally:
            if chat_id:
                self._abort_flags.pop(chat_id, None)
