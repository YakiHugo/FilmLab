# Single Image Render Kernel

- Baseline: `canvas image node(renderState) -> ImageRenderDocument -> render/image runtime -> imageProcessing stage helpers -> preview/export`
- Scope: finish the single-image cutover so canvas image nodes own canonical render state, single-image preview/export use one render kernel entry, and raster effects honor real masks

## Decisions

- `canvas` remains the only product entry for single-image authoring and preview/export orchestration.
- `src/render/image` is the canonical single-image render boundary. It no longer imports `editor` document builders or `renderDocumentToCanvas`.
- Canvas image nodes now write `renderState` as the normative persisted authoring shape. Legacy top-level `adjustments` and `filmProfileId` remain read-only compatibility fields.
- `CanvasWorkbenchSnapshot.version` is `4`.
- New image-node defaults are snapshot-based: asset defaults are copied once when canonical state is created; nodes do not keep live inheritance.
- `ImageRenderDevelopState` is structured into `tone / color / detail / fx / regions`; it no longer stores a raw `EditingAdjustments` blob.
- `renderSingleImageToCanvas(...)` owns single-image stage ordering:
  - `develop-base`
  - `afterDevelop`
  - `film-stage`
  - `afterFilm`
  - `timestamp`
  - `afterOutput`
- ASCII and `filter2d` are effect nodes. `maskId` now executes through real mask rasterization and masked compositing, not lookup-only plumbing.
- ASCII analysis cache keys include `revisionKey + placement + analysisSource + targetSize + quality + maskRevisionKey`.
- Legacy compatibility remains ingress-only:
  - legacy node/image fields can still be read
  - `legacyEditingAdjustmentsToCanvasImageRenderState(...)` is retained for migration and fallback
  - duplicate and reinsert flows canonicalize legacy image nodes back into `renderState`
  - store init now canonicalizes legacy image nodes against the current asset map before they become live workbench state
  - `renderSingleImageToCanvas(...)` now treats `ImageRenderDocument.source` as the authoritative image source instead of reading the runtime asset URL directly
  - `INSERT_NODES` now reuses the same asset-aware ingress as commit/preview; unresolved legacy image nodes are preserved instead of being rewritten to generic defaults

## Architecture

```mermaid
flowchart LR
  A["Canvas image node (renderState)"] --> B["ImageRenderDocument"]
  B --> C["renderSingleImageToCanvas"]
  C --> D["compileImageRenderDocumentToProcessSettings"]
  D --> E["imageProcessing stage helpers"]
  E --> F["develop-base"]
  F --> G["afterDevelop effects"]
  G --> H["film-stage"]
  H --> I["afterFilm effects"]
  I --> J["timestamp / afterOutput"]
  J --> K["preview canvas / single-image export"]
```

## Files

- `src/render/image/types.ts`
  - Canonical single-image contract: structured develop state, effect nodes, mask registry, `CanvasImageRenderStateV1`, `ImageRenderDocument`, and revision-key helpers.
- `src/render/image/stateCompiler.ts`
  - Bridge compiler between canonical render state and legacy low-level settings.
  - Owns default render-state construction, legacy ingress adaptation, structured-to-legacy adjustment compilation, and stripped process settings for runtime execution.
  - Also owns the canonical output-to-legacy timestamp bridge so runtime output staging does not rebuild timestamp settings ad hoc.
- `src/render/image/legacyAdapter.ts`
  - Legacy ingress only. Converts legacy asset/adjustment inputs into canonical render state or `ImageRenderDocument`.
- `src/render/image/renderSingleImage.ts`
  - Canonical single-image runtime entry.
  - Buckets effects by placement, generates explicit snapshots, restores timestamp overlay from canonical output state, executes masked raster effects against stable stage snapshots, and drives `imageProcessing` stage helpers.
  - Output-stage execution now awaits timestamp rendering before `afterOutput` effects run.
- `src/render/image/asciiAnalysis.ts`
  - ASCII analysis cache keyed by document revision, placement, quality, target size, and mask revision.
- `src/render/image/asciiEffect.ts`
  - Dedicated ASCII renderer with richer params and analysis-source selection.
- `src/render/image/effectMask.ts`
  - Shared raster mask renderer for single-image effect compositing. Supports radial, linear, and brush masks plus luma/hue/sat gating.
- `src/features/canvas/boardImageRendering.ts`
  - Canvas preview entry. Builds `ImageRenderDocument`, preserves dependency-aware cache invalidation, and calls `renderSingleImageToCanvas(...)`.
- `src/features/canvas/imageRenderState.ts`
  - Canonical image-state resolution boundary for canvas nodes. Authoring surfaces and preview/export entrypoints share this resolver instead of importing from the preview render module.
  - Asset-backed canonicalization is explicit: if the asset is missing, live mutation paths preserve legacy node fields or surface the image as temporarily non-editable instead of fabricating generic render state.
- `src/features/canvas/renderCanvasDocument.ts`
  - Single-image export path now shares the same runtime entry.
- `src/features/canvas/runtime/canvasPreviewRuntimeState.ts`
  - Preview runtime now tracks `draftRenderStateByElementId` instead of draft adjustments.
- `src/features/canvas/runtime/canvasRuntimeScope.ts`
  - Draft render-state mutation boundary for preview interactions.
- `src/features/canvas/runtime/canvasRuntimeHooks.ts`
  - Hooks now expose `useCanvasElementDraftRenderState(...)` and draft render-state preview actions.
- `src/features/canvas/CanvasImageEditPanel.tsx`
  - Image panel now edits `renderState`, while still presenting the current slider UI through a direct canonical-state view instead of round-tripping through the legacy compiler.
- `src/features/canvas/imageRenderStateEditing.ts`
  - Intent-level mutators and direct UI projections for render state: numeric slider application, ASCII updates, resets, film profile changes, and panel value resolution without recompiling legacy adjustments.
- `src/features/canvas/imagePropertyState.ts`
  - Property panel intents now emit `SET_IMAGE_RENDER_STATE` and canonicalize legacy nodes with the real asset when one is available.
- `src/features/canvas/imageNodeFactory.ts`
  - Canonical insertion helper for new image nodes. Snapshots asset defaults into `renderState` at insert time.
- `src/features/canvas/store/canvasWorkbenchNodeHelpers.ts`
  - Clone and duplicate helpers now rehydrate image nodes into canonical `renderState` instead of propagating legacy top-level adjustment fields.
- `src/features/canvas/store/canvasWorkbenchService.ts`
  - Store ingress now canonicalizes loaded legacy image nodes with asset-aware defaults and canonicalizes legacy image inserts before command execution.
- `src/features/canvas/hooks/useCanvasImagePropertyActions.ts`
  - Commits image property intents through canonical render-state commands.
- `src/features/canvas/editPanelSelection.ts`
  - Image edit selection now tracks `renderState`.
- `src/features/canvas/elements/ImageElement.tsx`
  - Preview invalidation and memo equality now fingerprint canonical render state instead of legacy top-level adjustment fields.
- `src/features/canvas/document/model.ts`
  - Snapshot writes normalize nodes and omit legacy top-level image fields when `renderState` exists.
- `src/features/canvas/document/migration.ts`
  - Version `4` read compatibility; preserves legacy image fields while accepting canonical `renderState`.
- `src/features/canvas/document/commands.ts`
  - `SET_IMAGE_RENDER_STATE` is the canonical image write command and clears legacy top-level fields on write.
- `src/types/canvas.ts`
  - Version `4` snapshot shape and canonical `renderState` field on persisted image elements.

## Risks

- Legacy image nodes are still read-compatible. Eager asset-aware canonicalization of old snapshots is still deferred; legacy nodes only become canonical when they are inserted, duplicated, edited through the image property path, or rendered with an asset in hand.
- `src/lib/imageProcessing.ts` still executes legacy-shaped low-level settings internally; canonical state is compiled down before entering that layer.
- Board/global stylization is intentionally out of scope. This task only completes the single-image kernel.
- This task does **not** mean the old renderer can be deleted wholesale. The canvas single-image path is on the new kernel, but the low-level bridge and non-canvas callers still exist.

## Current Status

- Scoped target: done.
- The new single-image pipeline is now the canonical path for:
  - canvas image authoring state
  - canvas single-image preview
  - canvas single-image export
  - raster effects such as ASCII and `filter2d`
- It is **not** yet the green light for:
  - deleting the old single-image-compatible renderer helpers from `imageProcessing`
  - deleting legacy adjustment compilation
  - treating editor or scene/global render paths as migrated

## Remaining Work

- `legacy-pipeline-retirement-readiness`
  - Confirm the remaining live callers that still depend on legacy-shaped low-level settings.
  - Add a short parity checklist before deleting any old single-image-specific branches:
    - plain photo
    - film only
    - film + ASCII
    - `afterDevelop` ASCII
    - masked ASCII / masked `filter2d`
    - invalid or missing film profile id
  - Only remove old single-image branches after parity is stable across preview/export.
- `low-level-settings-cutover`
  - Decide whether `stateCompiler -> imageProcessing` remains an acceptable long-term bridge.
  - If not, introduce a real low-level canonical process contract and retire legacy-shaped settings incrementally.
- `scene-level-follow-up`
  - Board/global stylization and scene-level effect graph work remain separate tasks.

## Validation

- Passed:
  - `pnpm exec vitest --run src/render/image src/features/editor/renderDocumentCanvas.test.ts`
  - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Handoff

- The original single-image architecture target is now in place for canvas single-image work:
  - canvas image nodes persist canonical `renderState`
  - preview and single-image export share one runtime entry
  - `render/image` is the single-image kernel boundary
  - raster effects support real masked execution
  - insertion, duplication, and image-property edits all preserve canonical `renderState`
  - legacy image snapshots are canonicalized before becoming live workbench state
  - document source ownership now lives on `ImageRenderDocument` instead of the runtime asset URL
  - canonical canvas image-state resolution no longer lives inside the preview render entry
  - `renderSingleImageToCanvas(...)` no longer advertises runtime asset ownership it does not use
  - timestamp overlay is restored from canonical output state in the single-image kernel
  - masked effect gating uses stable placement-stage snapshots instead of already-mutated bucket output
  - unresolved legacy image nodes are preserved until an asset-backed canonicalization boundary is reached; live mutation paths no longer fabricate generic render state
- The next agent should treat this task as **completed for its scoped target** and start from the follow-up tasks above instead of reopening the cutover blindly.
- Do **not** remove the old renderer wholesale from this task alone.
- If a later agent wants to delete old single-image branches, that agent should first prove parity and inventory remaining live callers.
