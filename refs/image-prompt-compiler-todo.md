# Image Prompt Compiler TODO

## Purpose

This note records how the current prompt-compiler implementation compares to the original direction from:

- `refs/arc.md`
- the initial external-agent research summary
- the approved `Image Prompt Compiler v1.2` implementation plan

This is a handoff note for the next agent. It is not a claim that the larger long-term direction is fully complete.

## Short Answer

No, the original direction is not 100% complete.

What is complete is the scoped `v1.2` implementation pass:

- shared `promptCompiler` capability contract
- operation-aware `PromptIR`
- structured degradation rules for generate-only runtime
- exact-retry artifact reuse semantics
- minimal frontend control surface for continuity / edit ops / role-aware assets
- prompt artifact inspection UI in image lab
- test-only multi-target fallback validation for compile / dispatch / executed-target consistency
- route and compiler persistence changes
- targeted tests and build validation

What is not complete is the broader long-term direction:

- real multi-target / fallback pressure testing in production-like conditions
- richer observability / taxonomy / analytics around semantic losses
- a stronger long-term canonical model for role-aware asset continuity beyond persisted `referenceAssetIds`

## Current Status

The project is no longer at the “should we build a prompt compiler” stage.
It now has a real compiler contract and a usable prompt orchestration path.

The system is currently in this state:

- backend compiler contract is explicit and shared
- frontend can express more of the compiler surface directly
- `image.edit` / `image.variation` are first-class semantic operations
- runtime execution is still `generate-only`
- degradation is explicit instead of implicit
- exact retry replays prompt artifacts instead of recompiling

This means:

- the v1.2 control plane work is mostly done
- the long-term platform direction is still not finished
- the next work should move from “make the contract real” to “make the platform operationally deeper”

## Completed In This Round

### Shared Capability Contract

- [x] Added shared `promptCompiler` facts to model capability data
- [x] Exposed `promptCompiler` through server catalog / frontend catalog
- [x] Removed server-private `targetCapabilities`
- [x] Unified compiler decisions on shared facts instead of duplicated switches

### Prompt Semantics

- [x] Kept `assetRefs.role` as the only operation source
- [x] Added explicit operation resolution:
  - `edit` -> `image.edit`
  - `variation` -> `image.variation`
  - otherwise -> `image.generate`
- [x] Added validation that only one source asset may exist per turn
- [x] Expanded `PromptIR` to include:
  - `operation`
  - `sourceAssets`
  - `referenceAssets`
  - `referenceImages`
  - `output`
- [x] Carried committed `referenceAssetIds` forward as generic reference continuity

### Compiler / Degradation

- [x] Kept `rewriteTurn` target-agnostic
- [x] Made `compilePromptForTarget` capability-driven
- [x] Added structured degradation semantics for:
  - operation downgrade
  - source-image unsupported / reference-guided fallback
  - negative prompt merge-to-main
  - exact text continuity risk
  - reference role collapse
- [x] Kept `APPROXIMATED_AS_REGENERATION` limited to degraded edit/variation cases

### Route / Persistence

- [x] Removed the old hard 400 for `image.edit` / `image.variation`
- [x] Persisted `run.operation` as the requested semantic operation
- [x] Added final dispatch artifact with `providerEffectivePrompt`
- [x] Made exact retry reuse prior request snapshot and prompt snapshot
- [x] Tightened exact retry to replay only image-generation runs, not arbitrary prompt-bearing runs
- [x] Stopped exact retry from fabricating fake rewrite/compile artifacts
- [x] Fixed lineage persistence so degraded edit/variation requests no longer write native `edited_from_asset` / `variant_of` edges

### Frontend Minimal Control Surface

- [x] Added continuity target controls
- [x] Added edit ops composer
- [x] Converted selected asset chips to role-aware chips
- [x] Added `Use as ref`
- [x] Added `Edit from this`
- [x] Wired `Vary`
- [x] Stopped force-switching to `qwen-image-2-pro`
- [x] Preserved `assetRefs` semantics on model switch even when `referenceImages` must be cleared
- [x] Fixed reuse-action failures so they no longer corrupt historical turn error state

### Tests / Validation

- [x] Added shared asset-role / operation tests
- [x] Added compiler-focused tests
- [x] Expanded route tests for degraded edit/variation and exact retry
- [x] Expanded route tests for multi-target fallback dispatch / target snapshot consistency
- [x] Added runtime router fallback unit tests
- [x] Expanded frontend helper tests for role-aware binding
- [x] Verified targeted tests
- [x] Verified `pnpm build`

## Partially Complete

### Canonical Creative State For Asset Continuity

Current state:

- committed `referenceAssetIds` now feed back into `PromptIR` as generic reference continuity
- `baseAssetId` remains continuity context only
- source asset roles do not automatically persist across turns

This is intentional for now, but it is still only a partial long-term answer.

What is still missing:

- a stronger role-aware canonical state model if future product semantics require cross-turn persistence of:
  - source edit origin
  - variation origin
  - richer per-asset intent beyond generic reference continuity

### Prompt Artifact Story

Current state:

- artifacts are now real enough to debug rewrite / compile / dispatch
- exact retry is now more honest because it only emits dispatch-level replay artifacts
- image lab now exposes a first-pass prompt artifact viewer for per-turn inspection

What is still missing:

- richer artifact browsing and comparison across targets / attempts
- broader artifact queryability for product/debug workflows

## Not Done Yet

These are the main gaps relative to the original broader direction.

### Multi-Target / Fallback Depth

- [ ] no production-like multi-target pressure test beyond mocked/test-only targets
- [ ] no browser/E2E coverage for fallback-triggered recompilation flows
- [ ] no real provider failure matrix validation for semantic-loss deltas across fallback targets

### Observability / Analytics

- [ ] no dedicated semantic-loss analytics view
- [ ] no aggregate reporting on degradation frequency by model / target
- [ ] no operator-facing prompt artifact observability surface

### Product Surface

- [ ] no advanced target comparison UI
- [ ] no explicit user-facing degradation explanation panel beyond transient warnings/notices

### Execution Scope

- [ ] still no native `/api/image-edit` or `/api/image-variation`
- [ ] runtime execution remains generate-only by design for this pass

## Important Constraints And Non-Goals

- `image.edit` and `image.variation` are currently semantic operations, not native execution endpoints
- degraded edit/variation must be treated as prompt-guided generate in lineage and warnings
- exact retry should replay old artifacts, not silently recompile
- committed `referenceAssetIds` are generic reference continuity only, not source-role persistence

## Key Files

These are the main entry points the next agent should read first.

### Shared Contract

- `shared/imageGeneration.ts`
- `shared/imageGenerationSchema.ts`
- `shared/imageModelCapabilityFacts.ts`
- `shared/imageModelCatalog.ts`
- `shared/chatImageTypes.ts`

### Server Compiler / Route

- `server/src/gateway/prompt/compiler.ts`
- `server/src/gateway/prompt/rewrite.ts`
- `server/src/gateway/prompt/types.ts`
- `server/src/routes/image-generate.ts`
- `server/src/shared/imageGenerationSchema.ts`

### Frontend

- `src/features/image-lab/ImagePromptInput.tsx`
- `src/features/image-lab/referenceImages.ts`
- `src/features/image-lab/hooks/useImageGeneration.ts`
- `src/features/image-lab/ImageResultCard.tsx`
- `src/features/image-lab/ImageChatFeed.tsx`
- `src/pages/image-lab.tsx`

### Tests

- `shared/imageGeneration.test.ts`
- `shared/imageGenerationSchema.test.ts`
- `server/src/gateway/prompt/compiler.test.ts`
- `server/src/routes/image-generate.test.ts`
- `src/features/image-lab/referenceImages.test.ts`

## Review Findings Already Fixed In This Round

These were found during post-implementation review and are already fixed:

- degraded edit/variation no longer write native lineage edges
- exact retry no longer matches arbitrary non-image runs
- exact retry no longer fabricates misleading rewrite/compile artifacts
- reuse-action failures no longer mutate historical turn error state
- committed reference continuity is no longer a dead field

## Validation Performed

Re-run in this follow-up:

- `pnpm vitest run server/src/routes/image-generate.test.ts server/src/gateway/router/router.test.ts`
- `pnpm vitest run server/src/gateway/prompt/compiler.test.ts src/features/image-lab/ImageChatFeed.test.tsx`

Previously verified in the original v1.2 implementation pass and retained here as historical context (not re-run in this follow-up):

- `pnpm vitest run shared/imageGeneration.test.ts shared/imageGenerationSchema.test.ts server/src/shared/imageGenerationCapabilityFacts.test.ts server/src/gateway/prompt/compiler.test.ts server/src/routes/image-generate.test.ts src/lib/ai/imageModelCatalog.test.ts src/stores/generationConfigStore.imageGeneration.test.ts src/features/image-lab/ImageChatFeed.test.tsx src/features/image-lab/referenceImages.test.ts`
- `pnpm build`

## Git State / Handoff Notes

- main implementation commit: `7b80fcc`
- commit message: `feat(ai): implement prompt compiler v1.2 orchestration`

Unrelated untracked files exist in the workspace and were intentionally not included:

- `%TEMP%/`
- `test-assets/images/Snipaste_2026-03-12_01-32-49.png`

Next agent should leave those alone unless the user explicitly asks about them.

## Recommended Next Step

If work continues immediately, the highest-value next tasks are:

1. add degradation / semantic-loss observability for operators and debugging
2. decide whether creative-state asset continuity should stay “generic reference only” or grow into a role-aware canonical asset state
3. pressure-test a real multi-deployment logical model outside test fixtures
4. add browser/E2E coverage for fallback-triggered recompilation once image-lab has an E2E harness
