import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("author profile cache migration creates table with unique and indexes", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../..");
  const migrationPath = path.join(
    repoRoot,
    "packages",
    "db",
    "prisma",
    "migrations",
    "20260424143000_leadradar_author_profile_cache",
    "migration.sql"
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE\s+"lead_author_profile_cache"/i);
  assert.match(sql, /CREATE UNIQUE INDEX\s+"lead_author_profile_cache_tg_acc_user_key"/i);
  assert.match(sql, /CREATE INDEX\s+"lead_author_profile_cache_tg_acc_expires_idx"/i);
});

