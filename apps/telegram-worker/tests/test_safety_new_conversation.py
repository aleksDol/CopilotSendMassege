import os
import unittest


# Required by app.config.Settings at import time.
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/test")
os.environ.setdefault("INTERNAL_API_TOKEN", "test-token")
os.environ.setdefault("TELEGRAM_API_ID", "1")
os.environ.setdefault("TELEGRAM_API_HASH", "test-hash")
os.environ.setdefault("TELEGRAM_SESSION_ENCRYPTION_KEY", "test-key")

from app.services.auth_flow import WorkerError
from app.services import safety as safety_module
from app.services.safety import TelegramSafetyService


class TestSafetyNewConversationCounting(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.prev_max_new = safety_module.settings.telegram_max_new_conversations_per_hour
        self.prev_retry_attempts = safety_module.settings.telegram_send_retry_max_attempts
        self.prev_min_interval = safety_module.settings.telegram_min_send_interval_ms

        self.prev_has_outbound = safety_module._has_outbound_history
        self.prev_has_inbound = safety_module._has_inbound_history

        safety_module.settings.telegram_max_new_conversations_per_hour = 10
        safety_module.settings.telegram_send_retry_max_attempts = 1
        safety_module.settings.telegram_min_send_interval_ms = 0

        async def _always_false(*_args, **_kwargs):
            return False

        safety_module._has_outbound_history = _always_false
        safety_module._has_inbound_history = _always_false

        self.service = TelegramSafetyService()

    async def asyncTearDown(self) -> None:
        safety_module.settings.telegram_max_new_conversations_per_hour = self.prev_max_new
        safety_module.settings.telegram_send_retry_max_attempts = self.prev_retry_attempts
        safety_module.settings.telegram_min_send_interval_ms = self.prev_min_interval

        safety_module._has_outbound_history = self.prev_has_outbound
        safety_module._has_inbound_history = self.prev_has_inbound

    async def test_failed_send_does_not_consume_new_conversation_quota(self):
        async def failing_send():
            raise RuntimeError("boom")

        with self.assertRaises(WorkerError):
            await self.service.execute_send(
                company_id="c1",
                channel_account_id="a1",
                external_conversation_id="chat1",
                send_coro_factory=failing_send,
            )

        state = await self.service._state("a1")
        self.assertEqual(len(state.new_conversation_timestamps), 0)
        self.assertEqual(len(state.send_timestamps), 0)

    async def test_successful_send_consumes_new_conversation_quota(self):
        async def successful_send():
            return {"status": "sent"}

        result = await self.service.execute_send(
            company_id="c1",
            channel_account_id="a1",
            external_conversation_id="chat1",
            send_coro_factory=successful_send,
        )

        self.assertEqual(result.get("status"), "sent")
        state = await self.service._state("a1")
        self.assertEqual(len(state.new_conversation_timestamps), 1)
        self.assertEqual(len(state.send_timestamps), 1)


if __name__ == "__main__":
    unittest.main()
