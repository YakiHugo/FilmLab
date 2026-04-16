# Server Logic Hardening

- Status: in_progress
- Scope: harden the server-side AI gateway so an AI-only workflow has a real oracle (tests) and localized edit surfaces. Work is driven by the fact that the user codes exclusively through AI: tests must exercise production paths, parallel implementations drift silently, and large coupled modules cause edits to cross concerns.

## Goal

- Add a real-Postgres integration harness so green tests actually reflect production behavior. Currently all DB tests `vi.mock("pg")`, which makes schema / SQL / migration errors invisible.
- Eliminate domain-logic duplication between `MemoryChatStateRepository` and `PostgresChatStateRepository`, or retire `MemoryChatStateRepository` outright if the integration harness makes it redundant.
- Break the bidirectional type cycle between `gateway/prompt/*` and `chat/persistence/*`.
- Decompose the 1579-line `ImageGenerationService` along concern boundaries, so an AI edit to one concern (e.g. persistence) cannot accidentally mutate another (e.g. prompt compilation).
- Preserve all externally-observable behavior: client-facing API response shapes, DB schema, provider adapter contract.

## Slice Plan

### Slice 1. Real-DB integration harness (foundation)

- Decide harness backend:
  - Option A — `pg-mem`: in-process, zero dependencies, fast. Must verify it supports `JSONB`, `gen_random_uuid()`, and whatever else `migrations/001_baseline.sql` uses.
  - Option B — `docker compose` Postgres: exact production parity, costs a boot per run.
- Add `pnpm run verify:integration` that boots the chosen backend, runs migrations via the existing `node-pg-migrate` path, and executes a contract test suite against both `MemoryChatStateRepository` and `PostgresChatStateRepository` through the same spec.
- Contract domains to cover: conversation lifecycle; turn lifecycle; generation lifecycle (job → attempt → run → result); asset + edge persistence; prompt-version audit; snapshot-rebuild fidelity.
- Wire into `verify` if runtime stays under ~15 s; otherwise leave as a separate required gate.
- Decision at end of Slice 1: should `MemoryChatStateRepository` survive? If pg-mem boots in <1 s, Memory has no unique value.

### Slice 2. Break gateway ↔ persistence type cycle

- Current cycle (verified):
  - `server/src/gateway/prompt/compiler.ts:3-4` imports `PersistedPromptSnapshot, PersistedSemanticLoss` from `chat/persistence/models`.
  - `server/src/chat/persistence/types.ts:12` imports `PromptVersionRecord` from `gateway/prompt/types`.
- Extract the shared concepts (prompt snapshot, semantic loss, prompt-version record) into a dependency-free `server/src/domain/prompt.ts` module (or equivalent). Both `gateway/` and `chat/persistence/` import downward only.
- Remove any lingering bidirectional imports.

### Slice 3. Deduplicate persistence domain logic

- Identify the logic currently duplicated between `memory.ts` (692 lines) and `postgres.ts` + `postgres/mutations.ts` + `postgres/conversationQueries.ts`: snapshot building, asset-edge construction, turn-visibility filtering, prompt-version assembly.
- Move duplicated logic into `chat/domain/*` services that work on abstract data. Repository implementations shrink to IO primitives (put / get / scan / transaction boundary + row mapping).
- Slice 1's contract tests run both implementations through the same spec and catch any divergence introduced during the move.
- If Slice 1 retired Memory, this slice is mostly "move helpers out of postgres.ts into domain/".

### Slice 4. Decompose `ImageGenerationService`

- Current file: `server/src/chat/application/imageGenerationService.ts`, 1579 lines, mixes validation + prompt compilation + asset projection + route selection + provider call + download + normalize + persistence + failure cleanup.
- Extract four coordinators, each with an explicit TS contract (no `this.*` state passing):
  - `PromptCompileCoordinator` — request validation, IR build, per-target compilation, compile cache.
  - `InputAssetProjector` — fetch, validate, project input assets for provider execution.
  - `ProviderExecutor` — route target selection, provider `.generate()`, retry/fallback, health recording.
  - `GenerationPersister` — job/attempt/run creation, `completeGenerationSuccess`, failure cleanup, deferred prompt-state update.
- `ImageGenerationService.execute()` becomes thin orchestration (~150–250 lines): call each coordinator, thread the trace id, map errors to `ImageGenerationCommandError`.
- Composition moves to `index.ts` via Fastify decorators; routes read `app.imageGenerationService` instead of `new ImageGenerationService(...)` inline.

### Slice 5 (optional, defer unless time). Boundary hardening

- Zod-parse provider responses at the adapter boundary (pick only fields actually consumed).
- `/health/ready` probes DB via `pool.query("SELECT 1")`.
- Per-provider call timing log (`{ provider, model, latencyMs, success }`).

## Validation Boundary

- No change to client-facing API response shapes.
- No DB schema migrations unless a slice explicitly requires one; none currently do.
- No change to `PlatformModelAdapter` contract or provider adapter call signatures.
- All existing route and repository tests continue to pass unchanged.
- Behavior-preserving for prompt compilation output (`compiledPrompt`, `dispatchedPrompt`) and persistence row shapes.

## Validation

- Pass: `pnpm lint`
- Pass: `pnpm test`
- Pass (new, added in Slice 1): `pnpm run verify:integration`
- Pass: `pnpm run build:server`
- Pass: `git diff --check`

## Handoff

### Slice 1 (done)

- Harness backend: `pg-mem`. Migration (`migrations/001_baseline.sql`) applies cleanly. JSONB + `->>` + revision CAS, partial indexes, ON CONFLICT, BEGIN/COMMIT/ROLLBACK, and BYTEA all work. Boot is effectively instant (≈200 ms per fresh harness).
- Files added:
  - `server/src/chat/persistence/__integration/pgMemHarness.ts` — loads baseline migration into a pg-mem instance, exposes a real `pg.Pool` shim. Drops six partial indexes that trip a pg-mem query-planner bug (see note below).
  - `server/src/chat/persistence/__integration/contractFixtures.ts` — `createGenerationInput` helper with deterministic turn/job/run/attempt id derivation.
  - `server/src/chat/persistence/__integration/repositoryContract.ts` — `describeRepositoryContract` covering conversation lifecycle, turn+generation lifecycle (success, retry-failure, delete-during-flight), asset+edge persistence, prompt-version audit + observability aggregation, prompt-state CAS, and accept-turn state restore.
  - `server/src/chat/persistence/__integration/memory.contract.test.ts` and `postgres.contract.test.ts` — run the same contract against `MemoryChatStateRepository` and `PostgresChatStateRepository` via pg-mem (26 tests total).
- Files removed: `server/src/chat/persistence/memory.test.ts` — superseded by the shared contract.
- Scripts added to root `package.json`: `verify:integration` (focused alias). The contract tests already run under `pnpm test` via the existing vitest include pattern, so `pnpm verify` exercises them automatically.
- Runtime measured: `pnpm verify:integration` ≈ 3 s total; sits comfortably inside the 15 s budget for the combined `verify` gate.

#### pg-mem partial-index caveat

pg-mem v3.0.14 uses partial indexes for `WHERE col = $1` lookups without re-checking the index predicate, so rows outside the predicate disappear from results. The harness drops six partial indexes (`chat_conversations_active_user_idx`, `chat_turns_conversation_visible_created_idx`, `chat_runs_job_id_idx`, `generated_images_active_lookup_idx`, `assets_owner_hash_active_idx`, `assets_owner_updated_active_idx`) after migration. Production Postgres is unaffected.

#### Memory fate decision

Retire `MemoryChatStateRepository` in a follow-up slice, but not in this one. Rationale:

- pg-mem satisfies "fast, in-process, zero external infra" that Memory existed to provide for tests.
- Production/dev server startup still falls through `createChatStateRepository` to Memory when `DATABASE_URL` is absent. Retirement requires deciding the no-DB-URL behavior (fail fast vs. use pg-mem as dev-only fallback). That is a workflow decision with blast radius beyond this slice.
- Logic-duplication cleanup (Slice 3) is the right place to either delete Memory or replace the factory's fallback.

### Slice 1 validation state

- Pass: `pnpm lint` (one pre-existing warning in `imageGenerationService.ts`, unrelated).
- Pass: `pnpm test` (612/612).
- Pass: `pnpm run verify:integration` (26/26, ≈3 s).
- Pass: `pnpm run build:server`.
