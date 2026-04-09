-- Squashed baseline: combines 001_chat_state_base through 006_prompt_trace_id.
-- Pre-launch; no incremental migration path from prior inline schema.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  prompt_state JSONB NOT NULL DEFAULT '{
    "committed": {
      "prompt": null,
      "preserve": [],
      "avoid": [],
      "styleDirectives": [],
      "continuityTargets": [],
      "editOps": [],
      "referenceAssetIds": []
    },
    "candidate": null,
    "baseAssetId": null,
    "candidateTurnId": null,
    "revision": 0
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_active_user_idx
  ON chat_conversations(user_id)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS chat_conversations_user_updated_idx
  ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  retry_of_turn_id TEXT NULL,
  model_id TEXT NOT NULL,
  logical_model TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  runtime_provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  config_snapshot JSONB NOT NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  job_id TEXT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS chat_turns_conversation_created_idx
  ON chat_turns(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_turns_conversation_visible_created_idx
  ON chat_turns(conversation_id, created_at DESC)
  WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS chat_jobs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
  run_id TEXT NULL,
  model_id TEXT NOT NULL,
  logical_model TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  runtime_provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  request_snapshot JSONB NOT NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_jobs_turn_id_idx
  ON chat_jobs(turn_id);
CREATE INDEX IF NOT EXISTS chat_jobs_conversation_created_idx
  ON chat_jobs(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES chat_jobs(id) ON DELETE CASCADE,
  run_id TEXT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  provider_request_id TEXT NULL,
  provider_task_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_attempts_job_attempt_no_idx
  ON chat_attempts(job_id, attempt_no);

CREATE TABLE IF NOT EXISTS chat_results (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES chat_jobs(id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_id TEXT NULL,
  runtime_provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  mime_type TEXT NULL,
  revised_prompt TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  thread_asset_id TEXT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_results_turn_image_index_idx
  ON chat_results(turn_id, image_index);

CREATE TABLE IF NOT EXISTS chat_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
  job_id TEXT NULL REFERENCES chat_jobs(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_target JSONB NULL,
  selected_target JSONB NULL,
  executed_target JSONB NULL,
  prompt_snapshot JSONB NULL,
  error TEXT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  referenced_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_runs_conversation_created_idx
  ON chat_runs(conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chat_runs_job_id_idx
  ON chat_runs(job_id)
  WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_assets (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn_id TEXT NULL REFERENCES chat_turns(id) ON DELETE SET NULL,
  run_id TEXT NULL REFERENCES chat_runs(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL,
  label TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_assets_conversation_created_idx
  ON chat_assets(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_assets_run_id_idx
  ON chat_assets(run_id);

CREATE TABLE IF NOT EXISTS chat_asset_locators (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
  locator_type TEXT NOT NULL,
  locator_value TEXT NOT NULL,
  mime_type TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_asset_locators_asset_idx
  ON chat_asset_locators(asset_id, created_at ASC);

CREATE TABLE IF NOT EXISTS chat_asset_edges (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  source_asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
  target_asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  turn_id TEXT NULL REFERENCES chat_turns(id) ON DELETE SET NULL,
  run_id TEXT NULL REFERENCES chat_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_asset_edges_conversation_idx
  ON chat_asset_edges(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_data BYTEA NOT NULL,
  visibility TEXT NOT NULL,
  private_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS generated_images_turn_idx
  ON generated_images(turn_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_images_owner_idx
  ON generated_images(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_images_active_lookup_idx
  ON generated_images(id, private_token_hash)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_prompt_versions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  stage TEXT NOT NULL,
  target_key TEXT NULL,
  attempt INTEGER NULL,
  compiler_version TEXT NOT NULL,
  capability_version TEXT NOT NULL,
  original_prompt TEXT NOT NULL,
  prompt_intent JSONB NULL,
  turn_delta JSONB NULL,
  committed_state_before JSONB NULL,
  candidate_state_after JSONB NULL,
  prompt_ir JSONB NULL,
  compiled_prompt TEXT NULL,
  dispatched_prompt TEXT NULL,
  provider_effective_prompt TEXT NULL,
  semantic_losses JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  trace_id TEXT NULL
);
CREATE INDEX IF NOT EXISTS chat_prompt_versions_run_idx
  ON chat_prompt_versions(run_id, version ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS chat_prompt_versions_conversation_idx
  ON chat_prompt_versions(conversation_id, created_at DESC);
