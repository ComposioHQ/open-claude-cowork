"""Send user feedback to Colleen via GitHub Issues (same pattern as KangAIrooski Travel Agent)."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import httpx

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO", "CollDummeyer/travel-agent")

_CATEGORY_MAP: dict[str, tuple[str, str]] = {
    "bug": ("🐛", "bug"),
    "feature-request": ("✨", "enhancement"),
    "feedback": ("💬", "user-feedback"),
    "question": ("❓", "question"),
    "general": ("📝", "user-feedback"),
}


async def submit_feedback_to_github(
    message: str,
    category: str = "general",
    *,
    user_name: str | None = None,
    user_email: str | None = None,
) -> dict[str, Any]:
    """Create a GitHub issue with the user's message. Requires GITHUB_TOKEN."""
    if not message.strip():
        return {"status": "error", "message": "Message is required."}
    if not GITHUB_TOKEN:
        return {
            "status": "error",
            "message": "GitHub integration not configured (set GITHUB_TOKEN). Cannot send message to Colleen.",
        }

    name = user_name or "Desktop User"
    email = user_email or "not-provided"
    timestamp = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    emoji, label = _CATEGORY_MAP.get(category, ("📝", "user-feedback"))

    title = f"{emoji} {message[:60]}..." if len(message) > 60 else f"{emoji} {message}"
    body = f"""## Message from kangAIrooski / Open Claude Cowork User

**From:** {name} ({email})  
**Time:** {timestamp}  
**Category:** {category}

### Message

{message}

---
*Submitted via Tell Colleen*
"""

    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {
        "title": title,
        "body": body,
        "labels": [label, "tell-colleen"],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            issue_data = response.json()
    except httpx.HTTPError as e:
        return {"status": "error", "message": f"Failed to send message: {e}"}

    return {
        "status": "sent",
        "message": (
            f"Your message was sent to Colleen as GitHub Issue #{issue_data.get('number')}. "
            f"She can follow up there."
        ),
        "issue_url": issue_data.get("html_url"),
        "issue_number": issue_data.get("number"),
    }
