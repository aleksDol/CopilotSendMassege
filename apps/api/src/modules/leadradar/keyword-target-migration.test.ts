import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("keyword target migration adds target with message default and backfill update", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../..");
  const migrationPath = path.join(
    repoRoot,
    "packages",
    "db",
    "prisma",
    "migrations",
    "20260424120000_leadradar_keyword_target",
    "migration.sql"
  );

  const sql = await fs.readFile(migrationPath, "utf8");
  assert.match(sql, /ADD COLUMN\s+"target"\s+TEXT\s+NOT NULL\s+DEFAULT\s+'message'/i);
  assert.match(sql, /UPDATE\s+"lead_keywords"\s+SET\s+"target"\s*=\s*'message'/i);
});
