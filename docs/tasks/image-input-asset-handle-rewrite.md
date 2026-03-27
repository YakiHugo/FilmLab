# Image Input Asset Handle Rewrite

## Baseline

- Date: `2026-03-27`
- Scope: replace image-generation `referenceImages + assetRefs` dual-track state with explicit
  `operation + inputAssets`, keep server-side read compatibility for persisted history, and remove
  URL-backed request semantics from client and server request/config snapshots.
- Out of scope: model capability taxonomy changes and non-image asset pipelines.

## Architecture Decisions

- `assetId` remains the only canonical business handle for input images.
- `operation` is explicit request state with values `generate | edit | variation`; it is never
  inferred from input bindings.
- `inputAssets` is the only executable image-input collection. `guide` and `source` bindings share
  the same handle model, with `guideType/weight` only valid for `guide`.
- Asset import/upload and request binding are separate events. Import may return asset ids, but it
  does not mutate the current generation config on its own.
- New requests and snapshots only write `operation + inputAssets`. Compatibility adapters may read
  legacy `referenceImages/assetRefs` from persisted history.
- Preview URL, asset name, and availability are derived from the asset store or projected view
  state, never persisted in the request/config contract.

## Critical Invariants

- `generate` requests must not carry a `source` binding.
- `edit` and `variation` requests must carry exactly one `source` binding.
- Request-level dedupe is by `assetId` only.
- Asset-library dedupe remains service-side content-hash dedupe.
- Prompt IR and prompt artifacts do not store `referenceImages`.

## Validation Notes

- Targeted tests first: shared image-generation schema/types, image-lab state/actions, server image
  generation routes, prompt artifacts/persistence, provider image-input adapters.
- Before handoff: run targeted tests for touched areas, then `pnpm test` if the targeted pass is
  green enough to justify full-suite cost.
- If a slice fails and is not fixed immediately, record the first actionable failure here and stop
  claiming the slice as done.

## Progress

- Completed:
  - shared image-generation contract and schema now normalize legacy `referenceImages/assetRefs`
    into `operation + inputAssets`
  - frontend generation config, image-lab state, and image input UI now persist only
    `operation + inputAssets`; guide previews and labels are derived from asset store state
  - server request validation, prompt rewrite/compiler, persistence models, projector, provider
    request resolution, and asset-edge generation now consume `operation + inputAssets`
  - exact retry and prompt artifact read paths remain compatible with legacy snapshots
- Validation:
  - `pnpm test shared/imageGeneration.test.ts shared/imageGenerationSchema.test.ts src/features/image-lab/referenceImages.test.ts src/features/image-lab/hooks/useImageGeneration.snapshot.test.ts src/stores/generationConfigStore.imageGeneration.test.ts server/src/gateway/prompt/compiler.test.ts server/src/shared/imageGenerationCapabilityFacts.test.ts server/src/chat/persistence/postgres.promptArtifacts.test.ts server/src/providers/dashscope/models/qwen.test.ts server/src/routes/image-generate.test.ts server/src/routes/image-generate.eval.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec eslint src/pages/image-lab.tsx src/features/image-lab/ImagePromptInput.tsx src/features/image-lab/hooks/useImageGeneration.ts src/lib/ai/imageModelCatalog.ts src/features/image-lab/referenceImages.ts src/features/image-lab/hooks/imageLabViewState.ts server/src/shared/imageGenerationSchema.ts server/src/shared/imageGenerationCapabilityWarnings.ts server/src/assets/types.ts server/src/assets/service.ts server/src/providers/base/types.ts server/src/providers/dashscope/models/qwen.ts server/src/chat/persistence/models.ts server/src/chat/application/projectConversationView.ts server/src/chat/persistence/postgres/rows.ts server/src/gateway/prompt/compiler.ts server/src/gateway/prompt/rewrite.ts server/src/chat/application/imageGenerationService.ts server/src/gateway/prompt/compiler.test.ts server/src/shared/imageGenerationCapabilityFacts.test.ts server/src/routes/image-generate.test.ts server/src/routes/image-generate.eval.test.ts server/src/providers/dashscope/models/qwen.test.ts --max-warnings=0`
