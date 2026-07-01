from __future__ import annotations

import logging
from typing import Any, Literal

from telethon.errors import (
    ChannelPrivateError,
    FloodWaitError,
    RPCError,
    UserAlreadyParticipantError,
)
from telethon.tl.functions.channels import JoinChannelRequest

from app.services.sync_service import _resolve_conversation_type, _resolve_linked_chat_id

logger = logging.getLogger("telegram-worker.discussion_join")

JoinOutcome = Literal["joined", "already_joined", "private", "failed", "none"]


async def join_channel_entity(client: Any, entity: Any, *, context: str) -> JoinOutcome:
    """
    Join a public channel or supergroup. Raises FloodWaitError for caller retry.
    """
    try:
        await client(JoinChannelRequest(entity))
        return "joined"
    except UserAlreadyParticipantError:
        return "already_joined"
    except ChannelPrivateError:
        logger.warning("%s: chat is private", context)
        return "private"
    except FloodWaitError:
        raise
    except RPCError as exc:
        message = str(exc).lower()
        if "already" in message and "participant" in message:
            return "already_joined"
        logger.warning("%s: join RPC failed: %s", context, exc)
        return "failed"


async def join_linked_discussion_for_channel(client: Any, channel_entity: Any, *, context: str) -> dict[str, Any]:
    """
    After joining a broadcast channel, also join its linked discussion megagroup so the live
    listener receives comment events and Telegram API access is reliable.
    """
    if _resolve_conversation_type(channel_entity) != "channel":
        return {"discussionJoinStatus": "none", "discussionGroupChatId": None}

    linked_chat_id = await _resolve_linked_chat_id(client, channel_entity)
    if not linked_chat_id:
        logger.info("%s: channel has no linked discussion group", context)
        return {"discussionJoinStatus": "none", "discussionGroupChatId": None}

    try:
        discussion_entity = await client.get_entity(int(linked_chat_id))
    except Exception as exc:
        logger.warning(
            "%s: failed to resolve discussion entity %s: %s",
            context,
            linked_chat_id,
            exc,
        )
        return {"discussionJoinStatus": "failed", "discussionGroupChatId": linked_chat_id}

    discussion_context = f"{context} discussion={linked_chat_id}"
    status = await join_channel_entity(client, discussion_entity, context=discussion_context)
    if status in ("joined", "already_joined"):
        logger.info("%s: discussion group join ok status=%s", discussion_context, status)
    elif status == "private":
        logger.warning("%s: discussion group is private", discussion_context)
    else:
        logger.warning("%s: discussion group join failed status=%s", discussion_context, status)

    return {"discussionJoinStatus": status, "discussionGroupChatId": linked_chat_id}


async def join_entity_and_linked_discussion(client: Any, entity: Any, *, context: str) -> dict[str, Any]:
    """
    Join the target chat and, for broadcast channels, the linked discussion group.
    """
    primary_status = await join_channel_entity(client, entity, context=context)
    discussion_meta: dict[str, Any] = {
        "discussionJoinStatus": "none",
        "discussionGroupChatId": None,
    }
    if primary_status in ("joined", "already_joined"):
        discussion_meta = await join_linked_discussion_for_channel(client, entity, context=context)
    return {
        "primaryJoinStatus": primary_status,
        **discussion_meta,
    }
