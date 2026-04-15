from dataclasses import dataclass
import logging
from datetime import datetime, timezone
from typing import Any

import asyncio
import psycopg
from urllib.parse import urlparse
from telethon.errors import FloodWaitError, RPCError, ServerError, TimedOutError
from telethon.tl.types import Channel, Chat, InputUser, User
from telethon.tl.functions.users import GetUsersRequest
from telethon.tl.functions.messages import GetDiscussionMessageRequest
from telethon.utils import get_peer_id

from app.config import settings
from app.crypto import SessionCrypto
from app.db import get_connection
from app.internal_api_client import list_channel_comment_sources, push_message_event
from app.services.auth_flow import WorkerError, mark_error_by_channel
from app.telegram_client import create_client


logger = logging.getLogger("telegram-worker.sync")

@dataclass
class SyncResult:
    dialogs_synced: int = 0
    messages_synced: int = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_sync_message_sender(
    client: Any, message: Any, me: User, entity: Any
) -> tuple[str | None, str | None]:
    """
    Author display fields for synced messages.
    For groups/supergroups the dialog entity is Channel/Chat — must resolve the message sender, not the dialog peer.
    """
    sender_id = message.sender_id
    is_outgoing = bool(getattr(message, "out", False))
    if is_outgoing or (sender_id is not None and str(sender_id) == str(me.id)):
        fn = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or None
        return fn, me.username

    if isinstance(entity, User) and sender_id is not None and str(sender_id) == str(entity.id):
        fn = " ".join(part for part in [entity.first_name, entity.last_name] if part).strip() or None
        return fn, entity.username

    u: User | None = None
    try:
        sender = await message.get_sender()
        if isinstance(sender, User):
            u = sender
    except Exception:
        pass
    if u is None and sender_id is not None:
        try:
            ent = await client.get_entity(sender_id)
            if isinstance(ent, User):
                u = ent
        except Exception:
            pass
    if not isinstance(u, User):
        return None, None

    full_name = " ".join(part for part in [u.first_name, u.last_name] if part).strip() or None
    username = u.username

    if not username and sender_id is not None:
        try:
            ent = await client.get_entity(sender_id)
            if isinstance(ent, User) and ent.username:
                username = ent.username
                if not full_name:
                    full_name = " ".join(part for part in [ent.first_name, ent.last_name] if part).strip() or None
        except Exception:
            pass

    if not username and u.id and getattr(u, "access_hash", None) is not None:
        try:
            results = await client(GetUsersRequest([InputUser(u.id, u.access_hash)]))
            if results and isinstance(results[0], User) and results[0].username:
                username = results[0].username
                if not full_name:
                    full_name = " ".join(part for part in [results[0].first_name, results[0].last_name] if part).strip() or None
        except Exception:
            pass

    return full_name, username


def _resolve_conversation_type(entity: Any) -> str:
    if isinstance(entity, Channel):
        return "group" if getattr(entity, "megagroup", False) else "channel"
    if isinstance(entity, Chat):
        return "group"
    return "direct"


def _is_supported_private_human_dialog(entity: Any) -> bool:
    if not isinstance(entity, User):
        return False
    if getattr(entity, "bot", False):
        return False
    if getattr(entity, "is_self", False):
        return False
    if getattr(entity, "deleted", False):
        return False
    if getattr(entity, "support", False):
        return False
    return True


def _is_supported_dialog(entity: Any) -> bool:
    if _is_supported_private_human_dialog(entity):
        return True
    if not settings.enable_tg_group_ingestion:
        return False
    if isinstance(entity, Channel):
        return bool(getattr(entity, "megagroup", False))
    if isinstance(entity, Chat):
        return True
    return False


async def list_connected_accounts() -> list[dict[str, Any]]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT
                  ca."companyId",
                  ta."channelAccountId"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."channelType" = 'TELEGRAM'
                  AND ta."loginStatus" IN ('CONNECTED', 'ERROR', 'RECONNECT_REQUIRED')
                  AND ta."sessionDataEncrypted" IS NOT NULL
                '''
            )
            rows = await cur.fetchall()
    return rows or []


async def _load_connected_account(
    conn: psycopg.AsyncConnection, company_id: str, channel_account_id: str
) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(
            '''
            SELECT
              ta."id" AS "telegramAccountId",
              ta."channelAccountId",
              ta."sessionDataEncrypted",
              ta."loginStatus",
              ta."telegramUserId"
            FROM "TelegramAccount" ta
            JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
            WHERE ca."companyId" = %s
              AND ta."channelAccountId" = %s
              AND ca."channelType" = 'TELEGRAM'
            LIMIT 1
            ''',
            (company_id, channel_account_id),
        )
        account = await cur.fetchone()

    if not account:
        raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found for workspace", 404)

    if account["loginStatus"] not in ("CONNECTED", "ERROR"):
        raise WorkerError("TELEGRAM_NOT_CONNECTED", "Telegram account is not connected", 400)

    if not account.get("sessionDataEncrypted"):
        raise WorkerError("SESSION_MISSING", "Telegram session not found", 400)

    return account


async def _set_sync_markers(
    conn: psycopg.AsyncConnection, telegram_account_id: str, channel_account_id: str
) -> None:
    now = _now()
    async with conn.cursor() as cur:
        await cur.execute(
            '''
            UPDATE "TelegramAccount"
            SET "lastSyncAt" = %s, "lastEventAt" = %s, "errorMessage" = NULL,
                "loginStatus" = 'CONNECTED', "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (now, now, now, telegram_account_id),
        )
        await cur.execute(
            '''
            UPDATE "ChannelAccount"
            SET "status" = 'ACTIVE', "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (now, channel_account_id),
        )


async def run_initial_sync(
    company_id: str,
    channel_account_id: str,
    dialogs_limit: int | None,
    messages_per_dialog: int | None,
    crypto: SessionCrypto,
) -> SyncResult:
    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)
        result = SyncResult()
        dialogs_cap = dialogs_limit or settings.telegram_initial_dialog_limit
        messages_cap = messages_per_dialog or settings.telegram_initial_messages_per_dialog

        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            me = await client.get_me()

            async for dialog in client.iter_dialogs(limit=dialogs_cap):
                entity = dialog.entity
                if not _is_supported_dialog(entity):
                    continue

                result.dialogs_synced += 1
                conversation_type = _resolve_conversation_type(entity)

                async for message in client.iter_messages(dialog.id, limit=messages_cap):
                    sender_id = message.sender_id
                    is_outgoing = bool(getattr(message, "out", False))

                    sender_external_id = str(sender_id if sender_id is not None else me.id)
                    sender_type = "self" if is_outgoing else "user"
                    sender_full_name, sender_username = await _resolve_sync_message_sender(
                        client, message, me, entity
                    )

                    text = message.message if getattr(message, "message", None) else None

                    payload: dict[str, Any] = {
                        "telegramAccountId": str(account["telegramAccountId"]),
                        "externalConversationId": str(dialog.id),
                        "externalMessageId": str(message.id),
                        "senderExternalId": sender_external_id,
                        "senderType": sender_type,
                        "text": text,
                        "sentAt": message.date.isoformat(),
                        "isOutgoing": is_outgoing,
                        "replyToExternalMessageId": str(message.reply_to.reply_to_msg_id) if message.reply_to else None,
                        "rawPayload": {
                            "id": message.id,
                            "out": is_outgoing,
                            "senderId": sender_id,
                            "dialogType": conversation_type,
                            "peerIsHuman": True,
                            "peerExternalId": str(getattr(entity, "id", "")),
                            "peerFullName": " ".join(
                                part for part in [getattr(entity, "first_name", None), getattr(entity, "last_name", None)] if part
                            ).strip()
                            or None,
                            "peerUsername": getattr(entity, "username", None),
                            "peerIsBot": bool(getattr(entity, "bot", False)),
                            "isServiceDialog": bool(getattr(entity, "support", False) or getattr(entity, "is_self", False)),
                            "hasMedia": bool(getattr(message, "media", None)),
                        },
                        "conversationTitle": dialog.title,
                        "hasAttachment": bool(getattr(message, "media", None)),
                    }

                    # Telegram channel comments (linked discussion group -> channel).
                    linked_channel_id = getattr(entity, "linked_chat_id", None)
                    if conversation_type == "group" and linked_channel_id:
                        payload["rawPayload"]["dialogType"] = "channel_comment"
                        payload["rawPayload"]["relatedChannelId"] = str(linked_channel_id)
                        payload["rawPayload"]["relatedPostId"] = (
                            str(message.reply_to.reply_to_msg_id) if message.reply_to else None
                        )
                        payload["rawPayload"]["contextPreview"] = None
                        payload["rawPayload"]["dedupeKey"] = (
                            f'{payload["telegramAccountId"]}:{linked_channel_id}:{payload["rawPayload"]["relatedPostId"]}:{payload["externalMessageId"]}'
                        )
                    if sender_full_name:
                        payload["senderFullName"] = sender_full_name
                    if sender_username:
                        payload["senderUsername"] = sender_username

                    try:
                        await push_message_event(payload, timeout_s=20.0)
                        result.messages_synced += 1
                    except Exception as exc:
                        logger.warning("auto-sync push_message_event failed dialog=%s msgId=%s error=%s", dialog.id, message.id, exc)

            # LeadRadar channel comments ingestion (optional, source-driven).
            try:
                logger.info("channel_comments fetching sources for telegramAccountId=%s", str(account["telegramAccountId"]))
                sources = await list_channel_comment_sources(telegram_account_id=str(account["telegramAccountId"]))
                logger.info("channel_comments sources fetched count=%s", len(sources))
                if sources:
                    await _ingest_channel_comments_for_sources(
                        conn=conn,
                        client=client,
                        telegram_account_id=str(account["telegramAccountId"]),
                        sources=sources,
                        max_comments_per_post=50,
                        min_text_len=5,
                    )
            except WorkerError as exc:
                logger.warning("channel_comments WorkerError: code=%s message=%s", exc.code, exc.message)
            except Exception as exc:
                logger.warning("channel_comments unexpected error: %s", exc, exc_info=True)

            await _set_sync_markers(conn, account["telegramAccountId"], account["channelAccountId"])
            return result
        finally:
            await client.disconnect()


async def _get_last_processed_post_id(
    *, conn: psycopg.AsyncConnection, related_channel_id: str
) -> int:
    """
    No new tables: derive progress from already stored Message rows.
    We store related_post_id as TEXT; pick the max numeric value.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT COALESCE(MAX(NULLIF(m."related_post_id", '')::bigint), 0) AS max_post_id
            FROM "Message" m
            WHERE m."related_channel_id" = %s
            """,
            (related_channel_id,),
        )
        row = await cur.fetchone()
    try:
        return int(row[0] or 0)
    except Exception:
        return 0


async def _is_post_already_processed(
    *, conn: psycopg.AsyncConnection, source_id: str, related_channel_id: str, related_post_id: int
) -> bool:
    """
    No new tables: consider a post processed if we already saved at least one comment for it
    (dedupe_key prefix exists) OR any message row exists for (channel, post) with this sourceId.
    """
    prefix = f"{source_id}:{related_post_id}:"
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT 1
            FROM "Message" m
            WHERE m."related_channel_id" = %s
              AND m."related_post_id" = %s
              AND (
                m."dedupe_key" LIKE %s
                OR (m."rawPayload"->>'sourceId') = %s
              )
            LIMIT 1
            """,
            (related_channel_id, str(related_post_id), prefix + "%", source_id),
        )
        row = await cur.fetchone()
    return bool(row)


async def _ingest_channel_comments_for_sources(
    *,
    conn: psycopg.AsyncConnection,
    client: Any,
    telegram_account_id: str,
    sources: list[dict[str, Any]],
    max_comments_per_post: int,
    min_text_len: int,
) -> None:
    """
    Ingest Telegram channel comments as regular message events:
    - fetch new channel posts
    - for each post fetch up to N comments via discussion group
    - push each comment through existing /internal/telegram/events/message ingestion
    """
    for src in sources:
        channel_peer_id = str(src.get("telegramChatId") or "")
        source_id = str(src.get("id") or "")
        if not channel_peer_id or not source_id:
            logger.warning("channel_comments skipping source: missing peer_id or source_id src=%s", src)
            continue

        logger.info("channel_comments processing source id=%s channelPeerId=%s", source_id, channel_peer_id)
        last_post_id = await _get_last_processed_post_id(conn=conn, related_channel_id=channel_peer_id)
        logger.info("channel_comments last_post_id=%s for channelPeerId=%s", last_post_id, channel_peer_id)
        processed_posts_this_run: set[int] = set()

        posts_found = 0
        posts_skipped_already = 0
        comments_found = 0
        comments_saved = 0
        comments_skipped = 0

        # Fetch a small window of newest posts; filter by last_post_id.
        # NOTE: channel message ids are monotonically increasing per channel.
        try:
            resolved_id = int(channel_peer_id) if channel_peer_id.lstrip("-").isdigit() else channel_peer_id
            logger.info("channel_comments resolving entity peerId=%s resolvedId=%s", channel_peer_id, resolved_id)
            channel_entity = await client.get_entity(resolved_id)
            logger.info("channel_comments entity resolved: %s (type=%s)", getattr(channel_entity, 'title', '?'), type(channel_entity).__name__)
        except Exception as exc:
            logger.warning("channel_comments get_entity FAILED peerId=%s error=%s", channel_peer_id, exc, exc_info=True)
            continue

        # Only channels are expected here.
        posts: list[Any] = []
        try:
            async for m in client.iter_messages(channel_entity, limit=20):
                mid = getattr(m, "id", None)
                if not isinstance(mid, int):
                    continue
                if mid <= last_post_id:
                    break
                posts.append(m)
            logger.info("channel_comments fetched %s posts from channel %s (last_post_id=%s)", len(posts), channel_peer_id, last_post_id)
        except Exception as exc:
            logger.warning("channel_comments iter_messages FAILED channel=%s error=%s", channel_peer_id, exc, exc_info=True)
            continue

        posts_found = len(posts)

        # Process from oldest to newest to keep ordering stable.
        for post in reversed(posts):
            post_id = getattr(post, "id", None)
            if not isinstance(post_id, int) or post_id <= last_post_id:
                continue
            if post_id in processed_posts_this_run:
                posts_skipped_already += 1
                continue
            processed_posts_this_run.add(post_id)

            # Do not process the same post repeatedly across sync runs.
            try:
                if await _is_post_already_processed(
                    conn=conn,
                    source_id=source_id,
                    related_channel_id=channel_peer_id,
                    related_post_id=post_id,
                ):
                    posts_skipped_already += 1
                    continue
            except Exception:
                # Best-effort: if this check fails, continue ingestion.
                pass

            post_text = getattr(post, "message", None) or ""
            context_preview = (post_text or "").strip()[:240] or None

            # Resolve the linked discussion message for this channel post.
            try:
                logger.info("channel_comments resolving discussion for postId=%s", post_id)
                discussion = await client(GetDiscussionMessageRequest(peer=channel_entity, msg_id=post_id))
                discussion_messages = getattr(discussion, "messages", None) or []
                if not discussion_messages:
                    logger.info("channel_comments postId=%s has no discussion messages, skipping", post_id)
                    continue
                # Telethon may return multiple messages (channel + discussion). We must pick the one
                # that belongs to the discussion chat, otherwise fetching replies will fail.
                discussion_chat = None
                discussion_root = None
                discussion_msg_id = None
                for dm in discussion_messages:
                    peer = getattr(dm, "peer_id", None)
                    # For discussion root we expect a PeerChannel/PeerChat peer_id (not the channel post peer).
                    if peer is not None:
                        discussion_chat = peer
                        discussion_root = dm
                        discussion_msg_id = getattr(dm, "id", None)
                        # Prefer messages that are not the original channel post id.
                        if isinstance(discussion_msg_id, int) and discussion_msg_id != post_id:
                            break
                if discussion_chat is None or not isinstance(discussion_msg_id, int):
                    logger.info("channel_comments postId=%s discussion_chat/msg_id invalid, skipping", post_id)
                    continue
                logger.info("channel_comments postId=%s discussion resolved: chatPeer=%s rootMsgId=%s", post_id, discussion_chat, discussion_msg_id)
            except Exception as exc:
                logger.warning("channel_comments GetDiscussionMessage FAILED postId=%s error=%s", post_id, exc)
                continue

            # Fetch up to N comments (replies) for the discussion root.
            try:
                discussion_entity = await client.get_entity(discussion_chat)
                logger.info("channel_comments discussion entity resolved: %s", getattr(discussion_entity, 'title', '?'))
            except Exception as exc:
                logger.warning("channel_comments get_entity discussion FAILED postId=%s error=%s", post_id, exc)
                continue

            count = 0
            try:
                async for c in client.iter_messages(discussion_entity, reply_to=discussion_msg_id):
                    if count >= max_comments_per_post:
                        break
                    if getattr(c, "out", False):
                        continue
                    text = (getattr(c, "message", None) or "").strip()
                    if len(text) < min_text_len:
                        comments_skipped += 1
                        continue
                    comments_found += 1

                    sender_id = getattr(c, "sender_id", None)
                    sender_external_id = str(sender_id) if sender_id is not None else ""
                    if not sender_external_id:
                        comments_skipped += 1
                        continue

                    # Best-effort sender fields.
                    sender_full_name = None
                    sender_username = None
                    try:
                        sender = await c.get_sender()
                        if isinstance(sender, User):
                            sender_full_name = " ".join(part for part in [sender.first_name, sender.last_name] if part).strip() or None
                            sender_username = sender.username
                    except Exception:
                        pass

                    payload: dict[str, Any] = {
                        "telegramAccountId": telegram_account_id,
                        "externalConversationId": str(get_peer_id(discussion_entity)),
                        "externalMessageId": str(getattr(c, "id", "")),
                        "senderExternalId": sender_external_id,
                        "senderType": "user",
                        "senderFullName": sender_full_name,
                        "senderUsername": sender_username,
                        "text": text,
                        "sentAt": getattr(c, "date", _now()).isoformat(),
                        "isOutgoing": False,
                        "replyToExternalMessageId": str(discussion_msg_id),
                        "rawPayload": {
                            "dialogType": "channel_comment",
                            "sourceId": source_id,
                            "chatType": "channel_comments",
                            "relatedChannelId": channel_peer_id,
                            "relatedPostId": str(post_id),
                            "contextPreview": context_preview,
                            # Required dedupe format: source_id + post_id + message_id
                            "dedupeKey": f"{source_id}:{post_id}:{getattr(c, 'id', '')}",
                        },
                        "conversationTitle": getattr(discussion_entity, "title", None),
                        "hasAttachment": bool(getattr(c, "media", None)),
                    }

                    try:
                        await push_message_event(payload, timeout_s=20.0)
                        count += 1
                        comments_saved += 1
                    except Exception as exc:
                        logger.warning(
                            "channel_comments push_message_event FAILED postId=%s commentId=%s error=%s",
                            post_id,
                            getattr(c, "id", "?"),
                            exc,
                        )
                        comments_skipped += 1
            except Exception as exc:
                logger.warning(
                    "channel_comments iter_messages(replies) FAILED postId=%s rootMsgId=%s error=%s",
                    post_id,
                    discussion_msg_id,
                    exc,
                )
                continue

            # log per post
            logger.info(
                "channel_comments post processed sourceId=%s channelId=%s postId=%s saved=%s skipped=%s (limit=%s)",
                source_id,
                channel_peer_id,
                post_id,
                comments_saved,
                comments_skipped,
                max_comments_per_post,
            )

        logger.info(
            "channel_comments source run summary sourceId=%s channelId=%s postsFound=%s postsSkipped=%s commentsFound=%s commentsSaved=%s commentsSkipped=%s",
            source_id,
            channel_peer_id,
            posts_found,
            posts_skipped_already,
            comments_found,
            comments_saved,
            comments_skipped,
        )


def _parse_peer_id(raw: str) -> int | str:
    """Normalize external_conversation_id for Telethon: strip and convert numeric to int."""
    s = (raw or "").strip()
    if not s:
        raise WorkerError("INVALID_CONVERSATION_ID", "External conversation id is empty", 400)
    if s.lstrip("-").isdigit():
        return int(s)
    return s


async def send_message(
    company_id: str,
    channel_account_id: str,
    external_conversation_id: str,
    text: str,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    peer = _parse_peer_id(external_conversation_id)

    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)

        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            me = await client.get_me()
            # Resolve to InputPeer; for bare IDs Telethon only looks in cache, so we may need to fill cache via get_dialogs first
            try:
                input_entity = await client.get_input_entity(peer)
            except (ValueError, TypeError):
                # Entity not in cache (e.g. after session restart). Load dialogs so the peer gets cached.
                try:
                    await client.get_dialogs(limit=100)
                    input_entity = await client.get_input_entity(peer)
                except (ValueError, TypeError) as e:
                    raise WorkerError(
                        "INVALID_CONVERSATION_ID",
                        f"Could not resolve conversation: {e!s}",
                        400,
                    ) from e
            resolved_entity = await client.get_entity(input_entity)
            if not _is_supported_private_human_dialog(resolved_entity):
                raise WorkerError(
                    "UNSUPPORTED_CHAT_TYPE",
                    "Only private 1-to-1 chats with non-bot users are supported",
                    400,
                )
            sent = await client.send_message(entity=input_entity, message=text)

            event = {
                "telegramAccountId": str(account["telegramAccountId"]),
                "externalConversationId": external_conversation_id,
                "externalMessageId": str(sent.id),
                "senderExternalId": str(me.id),
                "senderType": "self",
                "senderFullName": " ".join(part for part in [me.first_name, me.last_name] if part).strip() or None,
                "senderUsername": me.username,
                "text": sent.message,
                "sentAt": sent.date.isoformat(),
                "isOutgoing": True,
                "replyToExternalMessageId": None,
                "rawPayload": {
                    "id": sent.id,
                    "out": True,
                    "senderId": me.id,
                    "dialogType": _resolve_conversation_type(resolved_entity),
                    "peerIsHuman": True,
                    "peerExternalId": str(getattr(resolved_entity, "id", "")),
                    "peerFullName": " ".join(
                        part
                        for part in [
                            getattr(resolved_entity, "first_name", None),
                            getattr(resolved_entity, "last_name", None),
                        ]
                        if part
                    ).strip()
                    or None,
                    "peerUsername": getattr(resolved_entity, "username", None),
                    "peerIsBot": bool(getattr(resolved_entity, "bot", False)),
                    "isServiceDialog": bool(
                        getattr(resolved_entity, "support", False) or getattr(resolved_entity, "is_self", False)
                    ),
                    "hasMedia": bool(getattr(sent, "media", None)),
                },
                "conversationTitle": " ".join(
                    part
                    for part in [
                        getattr(resolved_entity, "first_name", None),
                        getattr(resolved_entity, "last_name", None),
                    ]
                    if part
                ).strip()
                or getattr(resolved_entity, "username", None)
                or str(getattr(resolved_entity, "id", external_conversation_id)),
                "hasAttachment": bool(getattr(sent, "media", None)),
            }

            async def _ingest() -> None:
                try:
                    await push_message_event(event, timeout_s=20.0)
                except Exception as exc:
                    logger.warning(
                        "push_message_event failed after send channelAccount=%s conversation=%s msgId=%s err=%s",
                        channel_account_id,
                        external_conversation_id,
                        str(sent.id),
                        exc,
                    )

            # Do not block HTTP response on ingestion.
            asyncio.create_task(_ingest())

            now = _now()
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET "lastEventAt" = %s, "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (now, now, account["telegramAccountId"]),
                )

            return {
                "status": "sent",
                "details": {
                    "externalMessageId": str(sent.id)
                }
            }
        except ValueError as exc:
            raise WorkerError("INVALID_CONVERSATION_ID", "Invalid external conversation id", 400) from exc
        finally:
            await client.disconnect()


async def send_channel_post_comment(
    *,
    company_id: str,
    channel_account_id: str,
    channel_id: str,
    post_id: str,
    text: str,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    channel_peer = _parse_peer_id(channel_id)
    try:
        post_id_int = int(post_id)
    except ValueError as exc:
        raise WorkerError("INVALID_POST_ID", "Post id must be a number", 400) from exc

    message_text = (text or "").strip()
    if not message_text:
        raise WorkerError("EMPTY_COMMENT_TEXT", "Comment text is required", 400)

    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)

        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            me = await client.get_me()

            try:
                channel_entity = await client.get_entity(channel_peer)
            except Exception as exc:
                raise WorkerError("CHANNEL_NOT_FOUND", "Channel not found or inaccessible", 404) from exc

            if not isinstance(channel_entity, Channel):
                raise WorkerError("INVALID_CHANNEL", "Provided channel id does not resolve to a channel", 400)

            try:
                discussion = await client(GetDiscussionMessageRequest(peer=channel_entity, msg_id=post_id_int))
            except Exception as exc:
                raise WorkerError("DISCUSSION_NOT_FOUND", "Could not resolve linked discussion for this post", 404) from exc

            discussion_messages = getattr(discussion, "messages", None) or []
            discussion_chat = None
            discussion_msg_id = None
            for dm in discussion_messages:
                peer = getattr(dm, "peer_id", None)
                if peer is not None:
                    discussion_chat = peer
                    discussion_msg_id = getattr(dm, "id", None)
                    if isinstance(discussion_msg_id, int) and discussion_msg_id != post_id_int:
                        break

            if discussion_chat is None or not isinstance(discussion_msg_id, int):
                raise WorkerError("DISCUSSION_NOT_FOUND", "Linked discussion message not found", 404)

            try:
                discussion_entity = await client.get_entity(discussion_chat)
            except Exception as exc:
                raise WorkerError("DISCUSSION_CHAT_NOT_FOUND", "Linked discussion chat not accessible", 404) from exc

            sent = await client.send_message(
                entity=discussion_entity,
                message=message_text,
                reply_to=discussion_msg_id,
            )

            discussion_peer_id = str(get_peer_id(discussion_entity))
            related_channel_id = str(get_peer_id(channel_entity))
            event = {
                "telegramAccountId": str(account["telegramAccountId"]),
                "externalConversationId": discussion_peer_id,
                "externalMessageId": str(sent.id),
                "senderExternalId": str(me.id),
                "senderType": "self",
                "senderFullName": " ".join(part for part in [me.first_name, me.last_name] if part).strip() or None,
                "senderUsername": me.username,
                "text": sent.message,
                "sentAt": sent.date.isoformat(),
                "isOutgoing": True,
                "replyToExternalMessageId": str(discussion_msg_id),
                "rawPayload": {
                    "id": sent.id,
                    "out": True,
                    "senderId": me.id,
                    "dialogType": "channel_comment",
                    "chatType": "channel_comments",
                    "relatedChannelId": related_channel_id,
                    "relatedPostId": str(post_id_int),
                    "contextPreview": None,
                    "dedupeKey": f'{account["telegramAccountId"]}:{related_channel_id}:{post_id_int}:{sent.id}',
                    "hasMedia": bool(getattr(sent, "media", None)),
                },
                "conversationTitle": getattr(discussion_entity, "title", None),
                "hasAttachment": bool(getattr(sent, "media", None)),
            }

            async def _ingest() -> None:
                try:
                    await push_message_event(event, timeout_s=20.0)
                except Exception as exc:
                    logger.warning(
                        "push_message_event failed after send comment channelAccount=%s channel=%s post=%s msgId=%s err=%s",
                        channel_account_id,
                        channel_id,
                        post_id,
                        str(sent.id),
                        exc,
                    )

            asyncio.create_task(_ingest())

            now = _now()
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET "lastEventAt" = %s, "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (now, now, account["telegramAccountId"]),
                )

            return {
                "status": "sent",
                "details": {
                    "externalMessageId": str(sent.id),
                    "discussionConversationId": discussion_peer_id,
                    "replyToPostId": str(post_id_int),
                },
            }
        finally:
            await client.disconnect()


def _normalize_public_chat_link(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise WorkerError("INVALID_CHAT_LINK", "Chat link is empty", 400)

    if s.startswith("@"):
        s = s[1:]

    if s.startswith("http://") or s.startswith("https://"):
        try:
            parsed = urlparse(s)
            path = (parsed.path or "").strip("/")
            if not path:
                raise WorkerError("INVALID_CHAT_LINK", "Chat link is invalid", 400)
            s = path.split("/")[0]
        except WorkerError:
            raise
        except Exception as exc:
            raise WorkerError("INVALID_CHAT_LINK", "Chat link is invalid", 400) from exc
    elif s.startswith("t.me/") or s.startswith("telegram.me/"):
        s = s.split("/", 1)[1].strip("/")

    # Strip query/hash fragments if user pasted weird formats
    s = s.split("?")[0].split("#")[0].strip("/")

    if not s:
        raise WorkerError("INVALID_CHAT_LINK", "Chat link is invalid", 400)
    if s.lower().startswith("joinchat/") or s.startswith("+"):
        raise WorkerError("UNSUPPORTED_CHAT_LINK", "Invite links are not supported. Use a public @username link.", 400)

    return s


async def resolve_public_group_by_link(
    *,
    company_id: str,
    channel_account_id: str,
    link: str,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    username = _normalize_public_chat_link(link)

    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)
        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            try:
                entity = await client.get_entity(username)
            except (ValueError, TypeError) as exc:
                raise WorkerError("CHAT_NOT_FOUND", "Chat not found or not accessible", 404) from exc
            except FloodWaitError as exc:
                raise WorkerError(
                    "TELEGRAM_RATE_LIMITED",
                    f"Telegram rate limited. Retry in {exc.seconds}s",
                    429,
                ) from exc
            except (ServerError, TimedOutError) as exc:
                raise WorkerError(
                    "TELEGRAM_TRANSIENT_ERROR",
                    "Temporary Telegram error. Retry shortly.",
                    503,
                ) from exc
            except RPCError as exc:
                logger.warning("resolve get_entity RPCError: %s", exc)
                raise WorkerError(
                    "CHAT_NOT_FOUND",
                    f"Chat not found or not accessible: {exc!s}",
                    404,
                ) from exc
            except Exception as exc:
                logger.exception("resolve get_entity failed username=%s", username)
                raise WorkerError(
                    "CHAT_RESOLVE_FAILED",
                    f"Could not resolve chat: {exc!s}",
                    502,
                ) from exc

            chat_type = _resolve_conversation_type(entity)
            if chat_type == "direct":
                raise WorkerError("UNSUPPORTED_CHAT_TYPE", "Only public group chats are supported", 400)

            # Support public groups AND channels. Channels are used for "channel comments" sources.
            if isinstance(entity, Channel):
                # ok: can be megagroup (supergroup) or a channel (megagroup=False)
                pass
            elif isinstance(entity, Chat):
                pass
            else:
                raise WorkerError("UNSUPPORTED_CHAT_TYPE", "Only public group chats and channels are supported", 400)

            title = getattr(entity, "title", None)
            resolved_username = getattr(entity, "username", None)

            # Must match live_listener (event.chat_id) and dialog sync (dialog.id): full peer id, not raw entity.id.
            peer_id = str(get_peer_id(entity))

            return {
                "status": "resolved",
                "telegramChatId": peer_id,
                "chatTitle": title,
                # For channels we configure sources as "channel_comments" to ingest discussion comments.
                "chatType": "channel_comments" if chat_type == "channel" else "group",
                "username": resolved_username,
            }
        finally:
            await client.disconnect()
