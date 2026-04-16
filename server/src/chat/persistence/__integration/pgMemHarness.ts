import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, "../../../../migrations/001_baseline.sql");

let cachedMigration: string | null = null;
const loadMigration = (): string => {
  if (cachedMigration === null) {
    cachedMigration = readFileSync(migrationPath, "utf8");
  }
  return cachedMigration;
};

export interface PgMemHarness {
  pool: Pool;
  close(): Promise<void>;
}

// pg-mem's query planner incorrectly reuses partial indexes for lookups that do
// not satisfy the partial predicate, so rows outside the predicate become
// invisible. Production Postgres is unaffected. Drop the partial indexes so
// tests exercise full table scans with the same semantics.
const PARTIAL_INDEX_NAMES = [
  "chat_conversations_active_user_idx",
  "chat_turns_conversation_visible_created_idx",
  "chat_runs_job_id_idx",
  "generated_images_active_lookup_idx",
  "assets_owner_hash_active_idx",
  "assets_owner_updated_active_idx",
];

export const createPgMemHarness = (): PgMemHarness => {
  const db = newDb();
  db.public.none(loadMigration());
  for (const indexName of PARTIAL_INDEX_NAMES) {
    db.public.none(`DROP INDEX IF EXISTS ${indexName};`);
  }
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  return {
    pool,
    async close() {
      await pool.end();
    },
  };
};
