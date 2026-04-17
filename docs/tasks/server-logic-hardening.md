# Server Logic Hardening

- Status: slice-5-done
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
- Pass: `pnpm test` (603/603; the 612 figure logged earlier was stale — baseline count is 603).
- Pass: `pnpm run verify:integration` (26/26, ≈3 s).
- Pass: `pnpm run build:server`.

### Slice 2 (done)

- New module: `server/src/domain/prompt.ts` now owns the shared prompt vocabulary — `CreativeState`, `ConversationCreativeState`, `TurnDelta`, `PromptIR`, `SemanticLoss`, `PromptVersionStage`, `PromptVersionRecord`, `PromptVersionHashes`, `PromptCompilationContext`, plus the state helpers (`createEmptyCreativeState`, `createInitialConversationCreativeState`, `cloneCreativeState`, `cloneConversationCreativeState`). `PersistedPromptSnapshot` moved here as `PromptSnapshot`; it is now a domain concept, not a persistence one.
- `server/src/gateway/prompt/types.ts` deleted. All gateway-side consumers (`compiler.ts`, `compiler.test.ts`, `evals.test.ts`, `rewrite.ts`) import from `../../domain/prompt`.
- `gateway/prompt/compiler.ts`: dropped the `import type { PersistedPromptSnapshot, PersistedSemanticLoss } from "../../chat/persistence/models"` edge — this was the upward half of the cycle. Renamed local references to `PromptSnapshot` / `SemanticLoss`.
- `chat/persistence/models.ts`: imports from `domain/prompt` and keeps the `Persisted*` re-export aliases for now (added `PromptSnapshot as PersistedPromptSnapshot`; deleted the local `PersistedPromptSnapshot` interface). Full alias removal is Slice 3 scope, not this slice.
- `chat/persistence/types.ts`, `persistence/memory.ts`, `persistence/postgres.ts`, `persistence/postgres/mutations.ts`, `persistence/postgres/rows.ts`, `chat/application/imageGenerationService.ts`: all switched their `gateway/prompt/types` imports to `domain/prompt`.

#### Cycle verification

- `grep -R "gateway/prompt/types" server/src` returns no hits.
- `gateway/prompt/*` no longer imports anything from `chat/persistence/*`; `gateway/` ↔ `chat/persistence/` now share only through `domain/prompt`, which imports nothing from either side.
- `assets/types.ts` still imports `PersistedAssetEdgeType` from `chat/persistence/models` — this is a downward dep (assets → persistence) and is not part of the prompt cycle.

### Slice 2 validation state

- Pass: `pnpm lint` (same single pre-existing warning as Slice 1).
- Pass: `pnpm test` (603/603).
- Pass: `pnpm run verify:integration` (26/26, ≈2.3 s).
- Pass: `pnpm run build:server`.

### Slice 3 (done)

Extracted duplicated persistence domain logic into stateless helpers under `server/src/chat/domain/`. Memory and postgres repositories now share the same accept-turn algorithm, prompt-version comparators, and snapshot visibility filters; each repo only carries IO + row mapping around those calls.

- `server/src/chat/domain/acceptedState.ts` — new.
  - `AcceptedStateTraversal`: strategy hooks (`findLatestCandidateStateForTurn`, `getRetryOfTurnId`) that each repo implements against its IO.
  - `resolveAcceptedCreativeState(traversal, startingTurnId)`: walks the retry chain, returns the highest-priority `candidateStateAfter`. Algorithm preserved from the two prior copies (memory's private method + postgres' local helper).
  - `applyAcceptedCreativeState({ current, turnId, assetId, acceptedState })`: pure reducer returning `{ nextPromptState, previousBaseAssetId }`. Clones state, clears candidate, bumps revision, sets baseAssetId. Both repos now share the transition.

- `server/src/chat/domain/promptVersions.ts` — new.
  - `PROMPT_STAGE_PRIORITY` (rewrite 0 / compile 1 / dispatch 2).
  - `comparePromptVersionsByAcceptPriorityDesc`: stage desc → attempt desc → version desc → createdAt desc. Used by memory's accept traversal; postgres's SQL encodes the same ordering in the `ORDER BY` of the candidate-state query.
  - `comparePromptVersionsByArtifactOrderAsc`: version asc → createdAt asc. Used by `getPromptArtifactsForTurn` and observability artifact listing in memory (postgres does it in SQL).

- `server/src/chat/domain/snapshot.ts` — new.
  - `buildCreativeBrief(turns, promptState)`: moved here; `postgres/rows.ts` now re-exports it for existing consumers; memory's private copy deleted.
  - `filterAssetsByVisibleScope(assets, visibleTurnIds, visibleRunIds)`: shared asset visibility rule (asset.turnId ∈ visibleTurnIds OR asset.runId ∈ visibleRunIds).
  - `filterAssetEdgesByVisibleAssets(edges, visibleAssetIds)`: both source and target must reference visible assets.

- `server/src/chat/persistence/memory.ts`: deleted private `resolveAcceptedCreativeState`, `buildCreativeBrief`, and the local `PROMPT_STAGE_PRIORITY` table. `acceptConversationTurn` now builds an `AcceptedStateTraversal` and calls the shared helpers. `getConversationSnapshot` calls `filterAssetsByVisibleScope` / `filterAssetEdgesByVisibleAssets`. `getPromptArtifactsForTurn` and `getPromptObservabilityForConversation` use `comparePromptVersionsByArtifactOrderAsc`.

- `server/src/chat/persistence/postgres/mutations.ts`: replaced local `resolveAcceptedCreativeState` helper with `buildAcceptedStateTraversal(client, conversationId)` delegating the algorithm to the domain function. The accept mutation body now uses `applyAcceptedCreativeState` instead of hand-mutating `nextPromptState` fields; the SQL ordering in `findLatestCandidateStateForTurn` still encodes the same priority as `comparePromptVersionsByAcceptPriorityDesc`. Behavior also switched the candidate-state clone from `parseCreativeState` to `cloneCreativeState` (matches memory) since `parsePromptState` already validated the value.

- `server/src/chat/persistence/postgres/conversationQueries.ts`: `mapAssetRows` / `mapAssetEdgeRows` now delegate their visibility filters to the domain helpers after mapping rows to records. The mapping order changed (map then filter) but the filter rule is identical.

- `server/src/chat/persistence/postgres/rows.ts`: deleted the local `buildCreativeBrief` body. `conversationQueries.ts` and `mutations.ts` now import the domain version directly from `../../domain/snapshot`. Only `clonePromptState` remains as a local alias over the domain helper.

#### Known follow-ups (not this slice)

- Postgres `acceptConversationTurn` traversal issues up to 2·N queries (candidate-state + retry lookup per hop) where N is retry-chain depth. Real chains are typically depth 1–3, so this is latency-nit not latency-bug, but collapsing it to one recursive CTE (or adding a bulk `findAcceptedCreativeStateForChain` method on `AcceptedStateTraversal`) would make it O(1). File as a perf task; do not widen this slice.

#### What was deliberately left in place

- `MemoryChatStateRepository` survives this slice, per the Slice 1 handoff (retirement is a workflow decision about the no-DATABASE_URL path, not a dedup).
- `parseCreativeState` / `parsePromptState` stay in `postgres/rows.ts` — they operate on raw DB `unknown` payloads, so they belong next to the row definitions, not in domain.
- `buildPromptObservabilitySummary` is already a domain-shaped helper (pure function over abstract inputs); it keeps its current location since both repos already call the same function.

### Slice 3 validation state

- Pass: `pnpm lint` (same single pre-existing warning as prior slices).
- Pass: `pnpm test` (603/603).
- Pass: `pnpm run verify:integration` (26/26, ≈2.2 s).
- Pass: `pnpm run build:server`.
- Pass: `git diff --check`.

### Slice 4 (done)

Decomposed the 1579-line `ImageGenerationService` into four coordinator classes plus an assetization helper, under a new `server/src/chat/application/imageGeneration/` subdirectory. Composition moved to `index.ts` via a Fastify decorator; the route now reads `app.imageGenerationService` instead of constructing inline.

- `server/src/chat/application/imageGeneration/errors.ts` — `ImageGenerationCommandError` + `PersistedGenerationContext` (moved out so coordinators can throw/return them without circular imports).
- `server/src/chat/application/imageGeneration/helpers.ts` — stateless utilities: `cloneSnapshot`, `uniqueWarnings`, `formatNormalizationWarning`, `settleWithConcurrency`, `resolveEdgeType`, target-snapshot builders, `toExactRetryPayload`, `findRetryRun`/`findRetryJob`/`findMatchingExactTarget`.
- `server/src/chat/application/imageGeneration/buildPromptVersionRecord.ts` — the canonical `PromptVersionRecord` factory.
- `server/src/chat/application/imageGeneration/imageNormalization.ts` — `normalizeGeneratedImage` + `collectNormalizedImages` (download + size-assert + settle-results aggregation).
- `server/src/chat/application/imageGeneration/generatedAssets.ts` — `commitGeneratedAssets` helper that turns normalized images into persisted asset records + edges (calls `assetService.createGeneratedAsset` / `createAssetEdges`).
- `server/src/chat/application/imageGeneration/promptCompileCoordinator.ts` — `PromptCompileCoordinator` with `createContext`, `resolveRequestedOperation`, `validateCompatibility`, `resolveInitialPrompts` (exact-retry and new-prompt paths), `compileForDispatchAttempt`, and `buildFinalDispatchPromptVersion`.
- `server/src/chat/application/imageGeneration/inputAssetProjector.ts` — `InputAssetProjector.projectForDispatch` returning provider-resolved input assets for a target + retry mode.
- `server/src/chat/application/imageGeneration/providerExecutor.ts` — `ProviderExecutor` wrapping `createImageRuntimeRouter` (exposes `getRouteTargets` + `generate`). Retry/fallback + health recording stay in `gateway/router/router.ts`; the class binds the router to `config` once and lets the orchestrator stay router-agnostic.
- `server/src/chat/application/imageGeneration/generationPersister.ts` — `GenerationPersister` with `createInitial`, `persistDispatchPromptVersion`, `completeSuccess` (writes the final dispatch prompt version then calls `completeGenerationSuccess`), `updateDeferredPromptState` (CAS `updateConversationPromptState` with a warn-and-continue catch so a revision conflict after success still preserves the generation), and `handleFailure` (formerly `handleExecutionFailure`).

- `server/src/chat/application/imageGenerationService.ts` shrank from 1579 → 541 lines. The class holds one instance per coordinator; `execute()` threads ids / timestamps / resolved prompts through them. It still assembles the flat `createInitial` input literal inline (turn, job, run, attempt, rewriteRun, promptVersions) and the response shape — these are data-object constructions that don't cleanly extract without synthetic parameter bags.

- `server/src/index.ts` — decorates `app.imageGenerationService` with a single `ImageGenerationService({ repository, assetService, config })` instance.
- `server/src/fastify.d.ts` — adds `imageGenerationService: ImageGenerationService` to the `FastifyInstance` augmentation.
- `server/src/routes/image-generate.ts` — dropped the inline `new ImageGenerationService(...)`; calls `app.imageGenerationService.execute(...)`. `ImageGenerationCommandError` / `PersistedGenerationContext` still re-exported from `imageGenerationService.ts` so the route import stays unchanged.
- `server/src/routes/image-generate.test.ts` and `image-generate.eval.test.ts` — `createApp` decorates `imageGenerationService` with a real `ImageGenerationService` bound to the mocked `repository` + `assetService`. No behavior change; route tests drive the real orchestration path through the mocks.

#### Behavior preservation notes

- Exact-retry path keeps the same state-clear-and-skip semantics (`committedStateBefore: null`, `candidateStateAfter: null`, `promptIR: null`, pinned target).
- Per-attempt dispatch prompt version persistence sits right before the provider call inside `resolveRequest`, same as before.
- Prompt-state CAS failure after a successful generation still logs and returns the success response (the `.catch` now lives on `GenerationPersister.updateDeferredPromptState`).
- Normalization concurrency and per-attempt compile cache behavior are unchanged.

#### What was deliberately left in place

- The Phase 3 `createInitial` literal and the final response shape remain in `execute()`. Extracting them would require 15+ parameter bags; in-place they read as a sequential recipe. Orchestrator length (541 lines) is above the slice plan's 150–250 target for this reason.
- `ProviderExecutor` is a thin wrapper around `createImageRuntimeRouter` — retry/fallback/health recording stay in `gateway/router/router.ts`. If provider orchestration grows a new concern (e.g., per-provider timing log from Slice 5), this is the natural place to add it.
- Request-level validation (conversation lookup, retry-of-turn existence check, threadId/conversationId cross-check) stayed in `execute()` — it is request-dispatch level, not a compile or persist concern.

### Slice 4 validation state

- Pass: `pnpm lint` (no warnings; the pre-existing unused-`logger` warning in the old `imageGenerationService.ts` disappeared during the rewrite).
- Pass: `pnpm test` (603/603).
- Pass: `pnpm run verify:integration` (26/26, ≈2.5 s).
- Pass: `pnpm run build:server`.
- Pass: `git diff --check`.

### Slice 5 (done)

Three independent hardening items. All three share the same "fail faster at the boundary" principle but touch different boundaries (provider adapter I/O, deployment lifecycle, operator observability).

- **Zod-parse provider responses.** Every provider adapter that previously narrowed `unknown` payloads via ad-hoc `isRecord` checks now parses the upstream body with a local zod schema that declares exactly the fields we consume. Unknown keys are stripped (zod's default); fields with wrong types fail parsing and propagate as a provider-level error. Behavior-preserving for well-formed responses.
  - `server/src/providers/dashscopeShared.ts`: `dashscopeResponseSchema` covers `output.{choices[*].message.content[*].{image, text}, results[*].{url, actual_prompt}}`. `extractDashScopeImages` now reads the parsed result; the two-pass reducer (choices → fallback to results) stays the same.
  - `server/src/providers/ark/models/seedream.ts`: `seedreamResponseSchema` covers `{message?, error.message?, data[*].{url?, b64_json?, revised_prompt?, error.message?}}`. `extractImages` and `readSeedreamErrorMessage` consume the parsed shape instead of duck-typing.
  - `server/src/providers/kling/models/image.ts`: `klingResponseSchema` covers `{code?, message?, data.{task_id?, task_status?, task_status_msg?, task_result.images[*].{url?, watermark_url?}}}`. Create and poll responses both go through `parseKlingResponse`; invalid top-level shape now throws `ProviderError("Kling provider returned an invalid response.", 502)` instead of silently proceeding with nulls.
  - `server/src/providers/base/client.ts` + `server/src/providers/base/types.ts`: deleted the now-unused `toProviderRawResponse` helper and `ProviderRawResponse` type. Kling's test shed its `toProviderRawResponseMock` setup.

- **Database readiness probe.** `app.get("/health/ready", ...)` in `server/src/index.ts` runs `pool.query("SELECT 1")` when `DATABASE_URL` is configured and returns 503 on failure (with an error log). When no DB is configured, readiness reports `ok`. `/health` stays as the liveness check. Three new tests in `server/src/index.test.ts` cover the no-DB path, the success probe, and the 503-on-failure path. To test the DB path, the suite now mocks `pg.Pool` and `node-pg-migrate` (the runner was previously called unconditionally when `DATABASE_URL` was set).

- **Per-provider call timing log.** `server/src/gateway/router/router.ts` accepts an optional `logger: FastifyBaseLogger` on `createImageRuntimeRouter(...).generate`. On every provider attempt (success or retriable failure), the router emits a log line via `logger.info`/`logger.warn` with `{ provider, model, operation, success, latencyMs, errorType? }` alongside the existing `routerHealth.record(...)` call. The logger is threaded from `ImageGenerationService.execute` → `ProviderExecutor.generate` → `router.generate`. The adapter options passed to `adapter.generate({...})` are now explicit (`signal`, `timeoutMs`, `traceId`) instead of a blind spread that was silently propagating router-only keys (including the new `logger`) into provider transports. One new test in `router.test.ts` asserts both the warn-on-retry and info-on-success log shapes.

#### Behavior preservation notes

- Adapter success-path behavior is unchanged for any payload that previously passed the `isRecord`-based checks. Strictness increase is limited to "wrong type on a consumed field" (e.g., `image` being a number instead of a string) which now fails parsing; the previous behavior silently skipped such items.
- Kling's previous code returned success if the create response had `code !== 0` in a non-standard way; the new parser rejects non-number `code` values and the existing `(code ?? 0) !== 0` gate handles missing `code` the same as before.
- `/health` response body is still `{ status: "ok" }`; `/health/ready` reports `{ status: "ok" | "unavailable" }`.

### Slice 5 validation state

- Pass: `pnpm lint` (no warnings).
- Pass: `pnpm test` (607/607 — baseline 603 plus 4 new tests: 3 readiness probe cases, 1 router timing-log case).
- Pass: `pnpm run verify:integration` (26/26, ≈2.2 s).
- Pass: `pnpm run build:server`.
- Pass: `git diff --check`.

## Known follow-ups (deferred, not regressions)

Three items were deliberately left out of Slices 1–5. Each is a trade-off called out during its slice, not a bug. Do not reopen unless the stated trigger fires.

- **`ImageGenerationService.execute` is 541 lines** (Slice 4 target was 150–250). The Phase 3 `createInitial` literal and response-shape assembly stay in `execute()` because extracting them would need ~15 parameter bags and the in-place recipe reads sequentially. Trigger to revisit: a new generation modality (e.g., video, new provider family) lands in this path and forces a structural change anyway.

- **`MemoryChatStateRepository` still exists** alongside `PostgresChatStateRepository`. Slice 1 decided retirement requires choosing the no-`DATABASE_URL` startup behavior (fail-fast vs. pg-mem as dev fallback). Slice 3's shared `chat/domain/*` helpers prevent the two implementations from diverging on core algorithms, so dual-path risk is bounded. Trigger to revisit: AI edits start confusing the two repos, or the startup fallback behavior becomes a real blocker.

- **`Persisted*` re-export aliases** in `server/src/chat/persistence/models.ts` remain. Slice 2 deferred full removal to Slice 3; Slice 3 did not revisit. They are pure re-exports of the canonical types in `server/src/domain/prompt.ts`, so they add no runtime weight — only a naming-duplication papercut for readers. Trigger to revisit: bulk-rename of persistence types for another reason, or if a new agent mistakes `PersistedPromptSnapshot` for a distinct type from `PromptSnapshot`.
