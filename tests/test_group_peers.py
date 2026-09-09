import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
from typerx_desktop.peers import (
    can_reply_to_dialog,
    history_for_focus,
    should_accept_incoming,
)


class GroupPeerTests(unittest.TestCase):
    def test_private_user_can_reply(self):
        dialog = SimpleNamespace(
            is_user=True,
            is_group=False,
            entity=SimpleNamespace(is_self=False, bot=False),
        )
        self.assertTrue(can_reply_to_dialog(dialog))

    def test_bot_cannot_reply(self):
        dialog = SimpleNamespace(
            is_user=True,
            is_group=False,
            entity=SimpleNamespace(is_self=False, bot=True),
        )
        self.assertFalse(can_reply_to_dialog(dialog))

    def test_group_can_reply(self):
        dialog = SimpleNamespace(
            is_user=False,
            is_group=True,
            entity=SimpleNamespace(broadcast=False, title="Team"),
        )
        self.assertTrue(can_reply_to_dialog(dialog))

    def test_broadcast_channel_cannot_reply(self):
        dialog = SimpleNamespace(
            is_user=False,
            is_group=False,
            entity=SimpleNamespace(broadcast=True, title="News"),
        )
        self.assertFalse(can_reply_to_dialog(dialog))

    def test_group_requires_focus_sender(self):
        group = SimpleNamespace(title="Team", broadcast=False)
        event = SimpleNamespace(out=False, raw_text="hi", chat_id=-1001, sender_id=42)
        self.assertFalse(should_accept_incoming(-1001, event, {-1001: group}))
        self.assertTrue(should_accept_incoming(-1001, event, {-1001: group}, 42))
        event.sender_id = 99
        self.assertFalse(should_accept_incoming(-1001, event, {-1001: group}, 42))

    def test_private_incoming_must_match_peer(self):
        user = SimpleNamespace(bot=False, first_name="Ann")
        event = SimpleNamespace(out=False, raw_text="hi", chat_id=7, sender_id=99)
        self.assertFalse(should_accept_incoming(7, event, {7: user}))
        event.sender_id = 7
        self.assertTrue(should_accept_incoming(7, event, {7: user}))

    def test_history_keeps_focus_and_own_replies(self):
        rows = history_for_focus(
            [
                {"id": 1, "outgoing": False, "sender_id": 42, "content": "from target"},
                {"id": 2, "outgoing": False, "sender_id": 99, "content": "other"},
                {"id": 3, "outgoing": True, "sender_id": 1, "content": "ours"},
            ],
            42,
        )
        self.assertEqual([row["content"] for row in rows], ["from target", "ours"])
        self.assertEqual([row["role"] for row in rows], ["user", "assistant"])


if __name__ == "__main__":
    unittest.main()
