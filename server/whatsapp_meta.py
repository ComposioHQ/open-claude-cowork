"""Parse and verify Meta WhatsApp Cloud API webhooks (inbound messages)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def verify_meta_webhook_signature(app_secret: str, raw_body: bytes, signature_header: str | None) -> bool:
    """Verify X-Hub-Signature-256 from Meta."""
    if not signature_header or not app_secret:
        return False
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not signature_header.startswith("sha256="):
        return False
    return hmac.compare_digest(signature_header.strip(), expected)


def extract_inbound_text_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return list of inbound user text messages from a Meta webhook payload."""
    out: list[dict[str, Any]] = []
    if payload.get("object") != "whatsapp_business_account":
        return out
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            meta_block = value.get("metadata") or {}
            phone_number_id = meta_block.get("phone_number_id")
            for msg in value.get("messages") or []:
                if msg.get("type") != "text":
                    continue
                body = (msg.get("text") or {}).get("body") or ""
                from_wa = msg.get("from")
                msg_id = msg.get("id")
                if from_wa and body:
                    out.append(
                        {
                            "from": str(from_wa),
                            "text": str(body),
                            "message_id": str(msg_id) if msg_id else None,
                            "phone_number_id": str(phone_number_id) if phone_number_id else None,
                        }
                    )
    return out


def safe_json_dict(raw: bytes) -> dict[str, Any] | None:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        logger.warning("[META-WA] Invalid JSON: %s", e)
        return None
    return data if isinstance(data, dict) else None
