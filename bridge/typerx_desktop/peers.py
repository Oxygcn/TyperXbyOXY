"""Peer selection for AI replies: private users and groups, not bots or channels."""
from __future__ import annotations


def can_reply_to_dialog(dialog) -> bool:
    entity = getattr(dialog, "entity", None)
    if entity is None or getattr(entity, "left", False):
        return False
    if getattr(dialog, "is_user", False):
        return not getattr(entity, "is_self", False) and not getattr(entity, "bot", False)
    if getattr(dialog, "is_group", False):
        return not getattr(entity, "broadcast", False)
    return False


def is_private_user(entity) -> bool:
    return entity is not None and hasattr(entity, "bot") and not hasattr(entity, "broadcast")


def dialog_kind(dialog) -> str:
    if getattr(dialog, "is_user", False):
        return "user"
    if getattr(dialog, "is_group", False):
        return "group"
    return "other"


def sender_label(entity, outgoing: bool, fallback: str) -> str:
    if outgoing:
        return "Вы"
    if entity is None:
        return fallback
    name = " ".join(
        part for part in (
            getattr(entity, "first_name", None),
            getattr(entity, "last_name", None),
        )
        if part
    )
    return (name or getattr(entity, "title", None) or fallback)[:80]


def should_accept_incoming(target, event, peers, focus_sender=None) -> bool:
    if event.out or target is None or not getattr(event, "raw_text", None):
        return False
    if event.chat_id != target:
        return False
    entity = peers.get(target) if peers else None
    if is_private_user(entity):
        return event.sender_id == target
    if focus_sender is None:
        return False
    return event.sender_id == focus_sender


def history_for_focus(messages, focus_sender=None):
    """Keep own outgoing replies and, in groups, only the focused member's texts."""
    rows = []
    for item in messages:
        text = (item.get("content") or "").strip()
        if not text:
            continue
        outgoing = bool(item.get("outgoing"))
        sender_id = item.get("sender_id")
        if focus_sender is None:
            rows.append(
                {
                    "id": item["id"],
                    "role": "assistant" if outgoing else "user",
                    "content": text[:6000],
                }
            )
            continue
        if outgoing or sender_id == focus_sender:
            rows.append(
                {
                    "id": item["id"],
                    "role": "assistant" if outgoing else "user",
                    "content": text[:6000],
                }
            )
    return rows
