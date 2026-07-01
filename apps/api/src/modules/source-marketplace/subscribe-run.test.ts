import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSubscribeRunProgress,
  partitionCatalogEntriesByExistingSources,
  resolveSubscribeRunStatusAfterOutcome
} from "./subscribe-run.js";

test("computeSubscribeRunProgress uses skipped in numerator and denominator", () => {
  const progress = computeSubscribeRunProgress({
    totalCount: 45,
    joinedCount: 0,
    skippedCount: 3,
    failedCount: 0
  });

  assert.equal(progress.activeCount, 3);
  assert.equal(progress.percent, 6);
});

test("computeSubscribeRunProgress returns 100 when nothing to connect", () => {
  const progress = computeSubscribeRunProgress({
    totalCount: 0,
    joinedCount: 0,
    skippedCount: 5,
    failedCount: 0
  });

  assert.equal(progress.percent, 100);
  assert.equal(progress.activeCount, 5);
});

test("partitionCatalogEntriesByExistingSources dedupes and skips by chat id", () => {
  const result = partitionCatalogEntriesByExistingSources(
    [
      { id: "e1", telegramChatId: "-1001" },
      { id: "e1", telegramChatId: "-1001" },
      { id: "e2", telegramChatId: "-1002" },
      { id: "e3", telegramChatId: null }
    ],
    new Set(["-1001"])
  );

  assert.deepEqual(result, { toConnectEntryIds: ["e2", "e3"], skippedCount: 1 });
});

test("resolveSubscribeRunStatusAfterOutcome increments joinedCount on joined", () => {
  const result = resolveSubscribeRunStatusAfterOutcome(
    {
      totalCount: 3,
      joinedCount: 1,
      failedCount: 0,
      status: "running"
    },
    "joined"
  );

  assert.deepEqual(result, {
    nextJoinedCount: 2,
    nextFailedCount: 0,
    nextStatus: "running"
  });
});

test("resolveSubscribeRunStatusAfterOutcome increments failedCount on private", () => {
  const result = resolveSubscribeRunStatusAfterOutcome(
    {
      totalCount: 2,
      joinedCount: 1,
      failedCount: 0,
      status: "running"
    },
    "private"
  );

  assert.deepEqual(result, {
    nextJoinedCount: 1,
    nextFailedCount: 1,
    nextStatus: "completed"
  });
});

test("resolveSubscribeRunStatusAfterOutcome marks completed when all jobs are accounted for", () => {
  const result = resolveSubscribeRunStatusAfterOutcome(
    {
      totalCount: 2,
      joinedCount: 1,
      failedCount: 0,
      status: "running"
    },
    "joined"
  );

  assert.deepEqual(result, {
    nextJoinedCount: 2,
    nextFailedCount: 0,
    nextStatus: "completed"
  });
});
