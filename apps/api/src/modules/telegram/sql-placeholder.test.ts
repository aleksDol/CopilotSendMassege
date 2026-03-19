import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("telegram-worker auth_flow ChannelAccount insert has correct placeholder count", async () => {
  const here = fileURLToPath(import.meta.url);
  const dir = path.dirname(here);
  // apps/api/src/modules/telegram -> repo root
  const repoRoot = path.resolve(dir, "../../../../..");
  const authFlowPath = path.join(repoRoot, "apps/telegram-worker/app/services/auth_flow.py");

  const content = fs.readFileSync(authFlowPath, "utf-8");

  // We only care about the specific insert block that creates a dedicated ChannelAccount
  // for a real Telegram identity during QR/password login flows.
  const blocks = [...content.matchAll(/INSERT INTO "ChannelAccount"[\s\S]*?\)\s+VALUES\s*\([\s\S]*?\)\s+RETURNING "id"/g)];
  assert.ok(blocks.length >= 2, `expected at least 2 ChannelAccount insert blocks, got ${blocks.length}`);

  // The VALUES clause should have exactly 6 placeholders:
  // id, companyId, externalAccountId, displayName, createdByUserId, updatedAt
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]?.[0] ?? "";
    const placeholderCount = (block.match(/%s/g) ?? []).length;
    assert.equal(
      placeholderCount,
      6,
      `ChannelAccount insert block #${i + 1} has wrong placeholder count (got ${placeholderCount}, expected 6)`
    );
  }
});

