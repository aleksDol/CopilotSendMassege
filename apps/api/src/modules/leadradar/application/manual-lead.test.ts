import test from "node:test";
import assert from "node:assert/strict";
import { buildManualLeadCreateInput, normalizeManualLeadUsername, MANUAL_LEAD_CHAT_ID, MANUAL_LEAD_SOURCE_TYPE } from "./manual-lead.js";
import { createManualLeadBodySchema } from "../api/schemas.js";
import { LeadStatus } from "../domain/enums/lead-status.js";

test("normalizeManualLeadUsername trims, strips @, lowercases", () => {
  assert.equal(normalizeManualLeadUsername("  @User_Name  "), "user_name");
  assert.equal(normalizeManualLeadUsername("noat"), "noat");
});

test("buildManualLeadCreateInput sets inbox defaults for manual lead", () => {
  const input = buildManualLeadCreateInput({
    user_id: "user-1",
    telegram_account_id: "tg-1",
    display_name: "Иван",
    username: "ivan",
    comment: "Встретили на конференции"
  });
  assert.equal(input.user_id, "user-1");
  assert.equal(input.telegram_account_id, "tg-1");
  assert.equal(input.display_name, "Иван");
  assert.equal(input.username, "ivan");
  assert.equal(input.message_text, "Встретили на конференции");
  assert.equal(input.chat_id, MANUAL_LEAD_CHAT_ID);
  assert.equal(input.chat_title, "Личка");
  assert.equal(input.source_type, MANUAL_LEAD_SOURCE_TYPE);
  assert.equal(input.score, 1);
  assert.equal(input.status, LeadStatus.NEW);
  assert.equal(input.telegram_user_id, null);
  assert.ok(input.message_id.length > 0);
  assert.ok(input.message_date instanceof Date);
});

test("createManualLeadBodySchema rejects empty username/comment after trim", () => {
  assert.throws(() => createManualLeadBodySchema.parse({ username: "  ", comment: "x" }));
  assert.throws(() => createManualLeadBodySchema.parse({ username: "a", comment: "   " }));
});

test("createManualLeadBodySchema accepts optional name and normalizes username", () => {
  const out = createManualLeadBodySchema.parse({
    name: "  ",
    username: " @Nick ",
    comment: " коммент "
  });
  assert.equal(out.name, null);
  assert.equal(out.username, "nick");
  assert.equal(out.comment, "коммент");
});
