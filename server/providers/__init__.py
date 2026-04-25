"""Provider registry (Claude Agent SDK + OpenCode)."""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseProvider
from .claude import ClaudeProvider
from .opencode import OpencodeProvider

logger = logging.getLogger(__name__)

_providers: dict[str, type[BaseProvider]] = {
    "claude": ClaudeProvider,
    "opencode": OpencodeProvider,
}

_provider_instances: dict[str, BaseProvider] = {}


def get_provider(provider_name: str, config: dict[str, Any] | None = None) -> BaseProvider:
    name = (provider_name or "claude").lower()
    if name not in _providers:
        raise ValueError(
            f"Unknown provider: {name}. Available: {', '.join(_providers)}",
        )
    cache_key = f"{name}:{config!r}"
    if cache_key in _provider_instances:
        return _provider_instances[cache_key]
    cls = _providers[name]
    instance = cls(config or {})
    _provider_instances[cache_key] = instance
    return instance


def get_available_providers() -> list[str]:
    return list(_providers)


async def clear_provider_cache() -> None:
    for instance in _provider_instances.values():
        await instance.cleanup()
    _provider_instances.clear()


async def initialize_providers() -> None:
    logger.info("[Providers] Initializing providers...")
    try:
        opencode = get_provider("opencode")
        await opencode.initialize()
        logger.info("[Providers] OpenCode provider initialized")
    except FileNotFoundError as e:
        logger.warning(
            "[Providers] OpenCode CLI not found (install from https://opencode.ai): %s",
            e,
        )
    except Exception as e:
        logger.error("[Providers] Error initializing providers: %s", e)
