"""Base provider interface for AI agent backends."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any


class BaseProvider:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self.sessions: dict[str, str] = {}

    @property
    def name(self) -> str:
        raise NotImplementedError

    async def initialize(self) -> None:
        """Optional async setup (e.g. start local services)."""

    async def query(self, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        raise NotImplementedError

    def get_session(self, chat_id: str | None) -> str | None:
        if not chat_id:
            return None
        return self.sessions.get(chat_id)

    def set_session(self, chat_id: str, session_id: str) -> None:
        self.sessions[chat_id] = session_id

    def abort(self, chat_id: str) -> bool:
        return False

    async def cleanup(self) -> None:
        self.sessions.clear()
