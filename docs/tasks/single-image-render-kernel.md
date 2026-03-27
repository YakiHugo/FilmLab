# Single Image Render Kernel

- Baseline: current `canvas image element -> RenderDocument -> renderDocumentToCanvas -> renderImageToCanvas -> canvasImagePostProcessing`
- Scope: establish the new single-image render-kernel boundary and rewire canvas single-image preview/export onto one bridge entry

## Decisions

- Use a new neutral module under `src/render/image`.
- Make `renderSingleImageToCanvas(...)` the only single-image runtime bridge used by canvas preview and single-image export.
- Keep the bridge on top of `createRenderDocument -> renderDocumentToCanvas` in this phase; do not replace the legacy renderer yet.
- Preserve legacy `EditingAdjustments` compatibility through a dedicated adapter instead of changing persisted data now.
- Extract legacy `ascii` and canvas-only `brightness / hue / blur / dilate` into ordered effect nodes.
- Preserve current legacy effect order exactly: `ascii -> timestamp -> canvas-only filter`.
- Keep generic mask lookup in the new document contract, even while masks are still populated from legacy local-adjustment payloads.
- Extract the canvas-only filter implementation into a shared helper under `src/lib/filter2dPostProcessing.ts`; keep `canvasImagePostProcessing.ts` as a compatibility wrapper only.
- Keep preview cache invalidation dependency-aware by retaining the old texture dependency fingerprint in the canvas preview cache key.
- Treat an explicit unresolved `filmProfileId` override as a miss; do not fall back to the asset film profile.
- Treat this as a long task; keep slices small and independently verifiable.

## Files

- `src/render/image/types.ts`
  - Defines `ImageRenderDocument`, `ImageRenderRequest`, effect placements, mask registry, film provenance, and document revision keys.
- `src/render/image/legacyAdapter.ts`
  - Maps legacy asset/adjustment inputs into the new document shape and strips legacy-executed effect fields out of `develop.adjustments`.
- `src/render/image/renderSingleImage.ts`
  - Runtime bridge that renders the legacy base document, then applies effect nodes in legacy order: `afterFilm` -> timestamp -> `afterOutput`.
- `src/render/image/index.ts`
  - Stable re-export surface for the new single-image module.
- `src/lib/filter2dPostProcessing.ts`
  - Shared implementation for legacy `brightness / hue / blur / dilate` post-processing.
- `src/features/canvas/canvasImagePostProcessing.ts`
  - Thin compatibility wrapper over the shared filter helper.
- `src/features/canvas/boardImageRendering.ts`
  - Canvas preview entry now builds `ImageRenderDocument`, keeps dependency-aware preview cache keys, and calls `renderSingleImageToCanvas(...)`.
- `src/features/canvas/renderCanvasDocument.ts`
  - Single-image export path now calls `renderSingleImageToCanvas(...)` instead of driving the legacy document renderer directly.
- `src/render/image/types.test.ts`
  - Pure-function tests for document revisions and effect placement helpers.
- `src/render/image/legacyAdapter.test.ts`
  - Pure-function tests for legacy adaptation, film provenance, mask registry, and invalid explicit film-profile misses.
- `src/render/image/renderSingleImage.test.ts`
  - Runtime bridge tests for legacy intent mapping and `ascii -> timestamp -> filter2d` ordering.
- `src/features/canvas/boardImageRendering.test.ts`
  - Canvas preview tests for cache variants, zoom buckets, film-profile folding, and texture dependency invalidation.
- `src/features/canvas/renderCanvasDocument.test.ts`
  - Export wiring tests that assert image elements now route through `renderSingleImageToCanvas(...)`.

## Risks

- `canvas` files are already dirty in the working tree; continue avoiding unrelated edits.
- The runtime bridge still depends on the legacy document renderer; the new kernel boundary exists, but execution is not independent yet.
- `develop.adjustments` remains a transitional legacy payload for the old renderer.
- `localAdjustments` remain compatibility data; true mask extraction is deferred.
- `afterDevelop` execution and explicit analysis inputs are still not implemented.

## Validation

- Passed:
  - `pnpm exec vitest --run src/render/image/types.test.ts src/render/image/legacyAdapter.test.ts`
  - `pnpm exec vitest --run src/render/image/types.test.ts src/render/image/legacyAdapter.test.ts src/render/image/renderSingleImage.test.ts src/features/canvas/boardImageRendering.test.ts src/features/canvas/renderCanvasDocument.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - Architecture review: no issues found
  - Bug/regression review: no issues found after compatibility fixes

## Handoff

- Canvas single-image preview and single-image export now share the same runtime entry and request contract.
- The next slice should stop being bridge-only: either add `afterDevelop` plus explicit analysis inputs, or start decomposing the legacy base render stage behind `renderSingleImageToCanvas(...)`.
- Do not drop the dependency-aware preview cache key or explicit film-profile miss semantics during that next slice.
