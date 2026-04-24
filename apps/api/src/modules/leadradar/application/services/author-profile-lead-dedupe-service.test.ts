import test from "node:test";
import assert from "node:assert/strict";
import { AuthorProfileLeadDedupeService } from "./author-profile-lead-dedupe-service.js";

test("author_profile dedupe helper searches by telegramUserId first", async () => {
  const calls: any[] = [];
  const service = new AuthorProfileLeadDedupeService({
    leadRepo: {
      findExistingAuthorProfileLead: async (input: any) => {
        calls.push(input);
        return null;
      }
    } as any
  });

  await service.findExistingAuthorProfileLead({
    telegramAccountId: "ta1",
    telegramUserId: " 123 ",
    username: "alice"
  });

  assert.deepEqual(calls, [{ telegram_account_id: "ta1", telegram_user_id: "123" }]);
});

test("author_profile dedupe helper falls back to normalized username", async () => {
  const calls: any[] = [];
  const service = new AuthorProfileLeadDedupeService({
    leadRepo: {
      findExistingAuthorProfileLead: async (input: any) => {
        calls.push(input);
        return null;
      }
    } as any
  });

  await service.findExistingAuthorProfileLead({
    telegramAccountId: "ta1",
    telegramUserId: null,
    username: " @Alice "
  });

  assert.deepEqual(calls, [{ telegram_account_id: "ta1", username_normalized: "alice" }]);
});

