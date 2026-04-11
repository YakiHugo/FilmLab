# Image Generation Pipeline Server-Side Fixes

## Scope
Fix 7 architecture/logic issues in the server-side text-to-image generation pipeline.

## Completed Slices

### 1. compiledPrompt vs dispatchedPrompt distinction
- `compiler.ts`: Added `buildDispatchedPrompt` producing a concise provider-ready prompt (goal + preserve + style + edit ops + avoid).
- `compiledPrompt` retains the full structured audit output (Identity, Compiler Context, Committed State, Output Contract).
- Tests updated to verify `dispatchedPrompt` excludes compiler metadata.

### 2. Prompt state update deferred to post-generation
- `imageGenerationService.ts`: `updateConversationPromptState` runs after `completeGenerationSuccess`. A failure here only emits `logger.warn`, so the generation result is preserved and the conversation is not left in a dirty state.

### 3. Health score integrated into routing
- `selection.ts`: Imported `routerHealth` and added a health-score tiebreaker after priority in `selectRouteTargets`. Equal-priority deployments now prefer healthier providers.

### 4. Prompt compilation cache
- `imageGenerationService.ts`: Initial compilation results are stored in `compiledTargetCache` (Map keyed by `targetKey`). The `resolveRequest` dispatch callback reuses the cache and only falls back to recompilation for uncached targets.

### 5. Unconfigured providers filtered at selection (+ router safety net)
- `selection.ts`: Unconfigured providers (missing API keys) are filtered out during target selection when no specific provider is requested. Configured candidates are preferred; falls back to all candidates only if none are configured.
- `router.ts`: Credential-missing error changed from 401 (non-retriable, kills the fallback loop) to 503 (retriable) as a safety net for the edge cases where selection's filter is bypassed (explicit targets override, or no provider configured at all). 503 is already in `isRetriableProviderError`'s retriable set, so the fallback loop advances to the next target instead of aborting the whole request.

### 6. Transactional persistence
- `types.ts`: Extended `CreateChatGenerationInput` with optional `additionalRuns` and `promptVersions`.
- `postgres.ts`: Extracted `insertRun` and `insertPromptVersion` private helpers. `createGeneration` inserts additional runs and prompt versions in the same transaction. Eliminated 3 separate pre-dispatch transactions.
- `memory.ts`: Updated in-memory repo to match.

### 7. execute() method decomposition
- `normalizeGeneratedImage`, `collectNormalizedImages`, and `handleExecutionFailure` extracted as module-level helpers.
- `collectNormalizedImages` replaces the inline fulfilled/rejected split loop: it returns `{ normalizedImages, normalizationFailureCount, firstNormalizationError }` and takes provider/model + log context + logger as params.
- `handleExecutionFailure` replaces the ~95-line `catch` block: it persists the failure record, cleans up uncommitted assets/edges, maps the error to `ImageGenerationCommandError` (including `ChatPromptStateConflictError` → 409, `ProviderError` pass-through, generic → 500), and returns the mapped error for the caller to throw.

## Validation
- `tsc --noEmit` passes for both `server/tsconfig.json` and the root tsconfig.
- Test runner (vitest) requires Node 22+ because rolldown depends on `node:util.styleText`; the local environment runs Node 18, so vitest cannot be executed here. Re-run `pnpm test` on a Node 22+ environment before shipping.

## Files Modified
- `server/src/gateway/prompt/compiler.ts` — added `buildDispatchedPrompt`
- `server/src/gateway/prompt/compiler.test.ts` — `dispatchedPrompt` assertions
- `server/src/gateway/router/selection.ts` — health tiebreaker + configured-provider filtering
- `server/src/gateway/router/router.ts` — credential-missing 401 → 503
- `server/src/chat/application/imageGenerationService.ts` — deferred state update, compilation cache, `normalizeGeneratedImage`/`collectNormalizedImages`/`handleExecutionFailure` extractions
- `server/src/chat/persistence/types.ts` — extended `CreateChatGenerationInput`
- `server/src/chat/persistence/postgres.ts` — `insertRun`/`insertPromptVersion` helpers, batched transaction
- `server/src/chat/persistence/memory.ts` — `additionalRuns`/`promptVersions` support
