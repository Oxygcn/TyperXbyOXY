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


def should_accept_incoming(target, event, peers) -> bool:
    if event.out or target is None or not getattr(event, "raw_text", None):
        return False
    if event.chat_id != target:
        return False
    entity = peers.get(target) if peers else None
    if is_private_user(entity) and event.sender_id != target:
        return False
    return True
