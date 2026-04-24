import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("author profile matching setting migration adds boolean default false", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../..");
  const migrationPath = path.join(
    repoRoot,
    "packages",
    "db",
    "prisma",
    "migrations",
    "20260424190000_leadradar_author_profile_matching_setting",
    "migration.sql"
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  assert.match(sql, /ADD COLUMN\s+"author_profile_matching_enabled"\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i);
});

