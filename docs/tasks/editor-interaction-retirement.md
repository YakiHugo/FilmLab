# Editor Interaction Retirement

- Baseline: `asset records and canvas fallback paths still carried legacy editor-authored image state even though canvas renderState was already the real editing source`
- Scope: retire the remaining asset-level editor rendering surface so imported assets are source-only and canvas image nodes own all editable render state

## Decisions

- `CanvasImageElement.renderState` is the only editable image-render source of truth.
- Asset records now keep only source media, thumbnail data, metadata, sync state, and ownership fields.
- Legacy IndexedDB asset fields such as `adjustments`, `layers`, `presetId`, `intensity`, and `filmProfile*` are ignored on hydrate and never persisted again.
- Library thumbnails fall back to source thumbnails only; no local editor re-render or materialization path remains.
- The entire `src/features/editor` tree, asset-side editor helpers in `src/lib/editor*`, and the render-image legacy adapter are retired instead of being renamed in place.
- Canvas UI primitives and numeric adjustment typing were moved under `src/features/canvas` so live code no longer imports from an editor namespace.

## Slice Boundary

- In scope:
  - asset model, persistence, import pipeline, and DB cleanup for retired editor-authored fields
  - asset-store and current-user API cleanup for preset/layer/materialization operations
  - library batch preset UI removal
  - canvas default render-state ingress and preview dependency cleanup
  - deletion of dead editor render/materialization/history/thumbnail modules and their tests
- Out of scope:
  - changing the underlying single-image render core in `src/render/image/*`
  - changing server asset sync payloads beyond dropping unused local-only fields

## Execution Record

- Completed the asset/public API retirement:
  - removed asset-level editor fields from `Asset`, `AssetUpdate`, stored asset persistence, runtime hydrate, DB records, and import defaults
  - removed asset-store/current-user preset and layer mutation APIs
  - stopped writing, reading, or migrating authoring-layer state through IndexedDB
- Completed the library/runtime decoupling:
  - removed library batch preset controls and the related batch operation hook surface
  - removed rendered-thumbnail refresh/materialization/dependency logic from the asset store
  - switched canvas insert/canonicalization paths to neutral default render state
- Completed the canvas/editor split:
  - moved reused section/slider UI and numeric adjustment typing into `src/features/canvas`
  - removed legacy canvas image node fields so persisted image nodes keep only `assetId` plus `renderState`
  - simplified preview invalidation to source-asset identity/content plus node render state
- Completed the editor retirement:
  - deleted the remaining `src/features/editor/*` implementation and tests
  - deleted `src/lib/editorAdjustmentVisibility.ts`, `src/lib/editorLayerMasks.ts`, `src/lib/editorLayers.ts`, and their tests
  - deleted `src/render/image/legacyAdapter.ts` and its test, and removed the public export

## Files

- `src/types/index.ts`
  - removed asset-level editor authoring fields from `Asset` and `AssetUpdate`
- `src/stores/currentUser/persistence.ts`
  - stopped persisting/normalizing retired editor authoring state
- `src/stores/currentUser/runtimeAsset.ts`
  - hydrates source-only assets and drops legacy stored editor fields
- `src/stores/currentUser/importPipeline.ts`
  - imports assets without preset, film, or layer defaults
- `src/lib/db.ts`
  - removed asset authoring fields from stored records and deleted mask hydration logic tied to those fields
- `src/stores/assetStore.ts`
  - removed preset/layer/materialization APIs and rendered-thumbnail refresh flow
- `src/features/library/hooks/useBatchOperations.ts`
  - removed batch preset application support
- `src/features/library/AssetMetadataPanel.tsx`
  - removed batch preset UI
- `src/features/canvas/CanvasImageEditPanel.tsx`
  - now depends only on canvas-owned edit components and node render state
- `src/features/canvas/store/canvasWorkbenchService.ts`
  - canonicalizes missing image render state with neutral defaults
- `src/features/canvas/components/CanvasEditSection.tsx`
  - new home for the canvas edit section primitive
- `src/features/canvas/components/CanvasSliderRow.tsx`
  - new home for the canvas slider-row primitive
- `src/features/canvas/components/controls/SliderControl.tsx`
  - new canvas-local slider wrapper
- `src/features/canvas/imageAdjustmentTypes.ts`
  - new canvas-local numeric adjustment key typing
- `src/render/image/index.ts`
  - removed the legacy asset adapter export
- Deleted module trees:
  - `src/features/editor/*`
  - `src/lib/editorAdjustmentVisibility.ts`
  - `src/lib/editorLayerMasks.ts`
  - `src/lib/editorLayers.ts`
  - `src/render/image/legacyAdapter.ts`

## Validation

- Passed type validation:
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Passed focused regression suite:
  - `pnpm exec vitest --run src/features/canvas/boardImageRendering.test.ts src/stores/canvasStore.test.ts src/features/canvas/runtime/canvasPreviewRuntimeState.test.ts src/features/canvas/imageNodeFactory.test.ts src/features/canvas/selectionModel.test.ts src/features/canvas/hooks/useCanvasImagePropertyActions.test.ts src/features/canvas/imagePropertyState.test.ts src/features/canvas/renderCanvasDocument.test.ts src/features/canvas/store/canvasWorkbenchNodeHelpers.test.ts src/render/image/stateCompiler.test.ts src/stores/currentUser/runtimeAsset.test.ts src/stores/currentUserStore.import.test.ts`
- Passed live-source inventory:
  - no matches for `@/features/editor`
  - no matches for `editorAdjustmentVisibility`
  - no matches for `editorLayers`
  - no matches for `createCanvasImageRenderStateFromAsset`
  - no matches for `legacyAdapter`

## Handoff

- Old locally stored assets now render as source images in the library; preserving previous editor-authored appearance is intentionally unsupported.
- Canvas continues to own all editable image rendering state through node `renderState`; no data migration was required for existing workbenches.
