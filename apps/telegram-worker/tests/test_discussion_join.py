import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch


os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/test")
os.environ.setdefault("INTERNAL_API_TOKEN", "test-token")
os.environ.setdefault("TELEGRAM_API_ID", "1")
os.environ.setdefault("TELEGRAM_API_HASH", "test-hash")
os.environ.setdefault("TELEGRAM_SESSION_ENCRYPTION_KEY", "test-key")

from telethon.tl.types import Channel

from app.services.discussion_join import join_entity_and_linked_discussion, join_linked_discussion_for_channel


def _channel(*, megagroup: bool) -> Channel:
    return Channel(
        id=10,
        title="Test",
        photo=None,
        date=None,
        megagroup=megagroup,
        access_hash=1,
    )


class TestDiscussionJoin(unittest.IsolatedAsyncioTestCase):
    async def test_skips_discussion_for_megagroup(self) -> None:
        entity = _channel(megagroup=True)
        client = AsyncMock()

        result = await join_linked_discussion_for_channel(client, entity, context="test")

        self.assertEqual(result["discussionJoinStatus"], "none")
        self.assertIsNone(result["discussionGroupChatId"])
        client.get_entity.assert_not_called()

    async def test_joins_linked_discussion_for_channel(self) -> None:
        channel = _channel(megagroup=False)
        discussion = _channel(megagroup=True)
        client = AsyncMock()
        client.get_entity = AsyncMock(return_value=discussion)
        client.__call__ = AsyncMock()

        with patch(
            "app.services.discussion_join._resolve_linked_chat_id",
            new=AsyncMock(return_value="-10020"),
        ):
            result = await join_linked_discussion_for_channel(client, channel, context="test")

        self.assertEqual(result["discussionJoinStatus"], "joined")
        self.assertEqual(result["discussionGroupChatId"], "-10020")
        client.get_entity.assert_awaited_once_with(-10020)

    async def test_join_entity_and_linked_discussion_combines_results(self) -> None:
        channel = _channel(megagroup=False)
        client = AsyncMock()
        client.__call__ = AsyncMock()

        with patch(
            "app.services.discussion_join.join_linked_discussion_for_channel",
            new=AsyncMock(
                return_value={"discussionJoinStatus": "already_joined", "discussionGroupChatId": "-10020"}
            ),
        ):
            result = await join_entity_and_linked_discussion(client, channel, context="test")

        self.assertEqual(result["primaryJoinStatus"], "joined")
        self.assertEqual(result["discussionJoinStatus"], "already_joined")
        self.assertEqual(result["discussionGroupChatId"], "-10020")


if __name__ == "__main__":
    unittest.main()
