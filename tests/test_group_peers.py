import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
from typerx_desktop.peers import can_reply_to_dialog, should_accept_incoming


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

    def test_group_incoming_from_other_member(self):
        group = SimpleNamespace(title="Team", broadcast=False)
        event = SimpleNamespace(out=False, raw_text="hi", chat_id=-1001, sender_id=42)
        self.assertTrue(should_accept_incoming(-1001, event, {-1001: group}))

    def test_private_incoming_must_match_peer(self):
        user = SimpleNamespace(bot=False, first_name="Ann")
        event = SimpleNamespace(out=False, raw_text="hi", chat_id=7, sender_id=99)
        self.assertFalse(should_accept_incoming(7, event, {7: user}))
        event.sender_id = 7
        self.assertTrue(should_accept_incoming(7, event, {7: user}))


if __name__ == "__main__":
    unittest.main()
