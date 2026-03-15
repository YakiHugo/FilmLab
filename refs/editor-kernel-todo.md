# Editor Kernel TODO

## Purpose

This note records the current editor kernel roadmap after the first `EditorDocument + minimal RenderGraph` refactor.

It is based on the current FilmLab repository state and the earlier direction against:

- `refs/dehancer.md`
- `refs/luminar.md`

This is a working TODO note, not a promise that all items below are already implemented.

## Current Status

The editor is no longer in the "just pile on features" stage.
It now has the minimum runtime boundaries needed to keep evolving without another rewrite.

What is already in place:

- runtime `EditorDocument` as the editor-side canonical authoring state
- runtime `RenderDocument` with `renderGraph`, `dirtyKeys`, and `dirtyReasons`
- minimal `RenderGraph` with `develop`, `film`, `fx`, and `output` phases
- layer-scoped local adjustment metadata in the graph
- shared preview/export composition path
- shared multi-layer composition seam with a production `canvas2d` backend
- preview scheduler wired to graph keys and dirty reasons
- render-backed materialization contract placeholders for `flatten` and `merge-down`
- `flattenLayers` is now wired to render-backed materialization
- `mergeLayerDown` is now wired for the current safe subset: merging a layer into the base layer
- render-backed materialization now resolves merge targets from the real layer stack, not only renderable graph nodes
- render-backed materialization now clears editor history after bake operations
- render-backed materialization now aborts when authoring state changes during the async render
- materialization thumbnails are now derived directly from the rendered canvas instead of re-decoding the baked blob
- preview cache and preview render slot regressions fixed after review

What this means:

- Phase 1 foundation is mostly in place
- the long-term architecture direction is not finished
- current renderer behavior is still mostly the old execution model under better boundaries

## Completed In This Round

- [x] Formalize runtime `EditorDocument`
- [x] Keep `Asset` as persistence source without changing IndexedDB or sync schema
- [x] Add `RenderDocument.renderGraph`
- [x] Add `DirtyReason` / `DirtyKeyMap`
- [x] Scope local adjustments onto layer nodes as metadata
- [x] Share preview/export composition logic
- [x] Keep `flatten` / `merge-down` at contract level instead of faking implementation
- [x] Harden render-backed materialization against hidden-layer target skips
- [x] Harden render-backed materialization against stale authoring-state overwrites
- [x] Clear editor history after render-backed bake operations
- [x] Remove the extra full-image decode from the materialization thumbnail path
- [x] Stabilize preview source cache keys by source asset instead of render graph
- [x] Reuse stable preview render slots instead of generating graph-revision slots
- [x] Introduce a formal multi-layer compositing seam for `RenderGraph`
- [x] Route preview/export multi-layer composition through the shared `canvas2d` backend
- [x] Preserve ROI-aware mask/blend behavior behind the new backend seam
- [x] Add caller-level tests that lock preview/export routing into the shared seam
- [x] Fix the deferred export/materialization surface-aliasing regression introduced by the first seam refactor

## Remaining TODO

### Phase 1 Closure

- [x] Wire `flattenLayers` to the render-backed materialization contract
- [x] Wire `mergeLayerDown` to the render-backed materialization contract for `merge into base`
- [ ] Generalize render-backed `merge-down` beyond the current base-target-only safe subset
- [ ] Remove compatibility dependence on `RenderDocument.layerEntries` once all consumers are graph-native
- [ ] Add stronger tests for dirty-reason transitions across:
  - show original
  - crop mode
  - texture asset replacement
  - local mask edits
- [ ] Verify preview/export parity on more real multi-layer cases, not only current unit coverage

### Phase 2 Render Kernel

- [ ] Move multi-layer final composite off "CPU 2D as the main path"
- [ ] Widen the current compositing seam beyond `HTMLCanvasElement` surfaces so a GPU backend can plug in without another caller refactor
- [ ] Promote ROI from an optimization detail into a first-class invalidation input
- [ ] Add mask texture cache and scratch reuse rules at graph level
- [ ] Stop treating local adjustments as effectively "render global, then patch locally"
- [ ] Convert local adjustments into scoped render nodes with explicit placement in the pipeline
- [ ] Add reusable analysis passes for histogram / waveform instead of deriving only from the final preview

### Phase 3 Darkroom Model

- [ ] Split the pipeline into clearer develop / film / print / optics / output semantics
- [ ] Lift color management into a first-class subsystem
- [ ] Define explicit input transform / working space / display transform / export transform boundaries
- [ ] Add capability matrix for `WebGL2`, `WebGPU`, and CPU fallback
- [ ] Introduce an editor-native document format for layered projects and masks
- [ ] Support true render-backed flatten / merge / bake workflows

## Product-Directed TODO

### Luminar Direction

- [ ] Improve advanced layer semantics beyond the current minimal layer graph
- [ ] Add stronger adjustment-layer and texture-layer execution rules
- [ ] Keep pushing toward better multi-layer preview/export consistency
- [ ] Prepare for smarter masking and future AI sidecars without tying editor truth to `Asset`

### Dehancer Direction

- [ ] Keep the current phase and slot structure flexible enough for film-chain growth
- [ ] Do not hard-code a flat adjustment model that blocks film/print ordering later
- [ ] Leave implementation room for `Input -> Film -> Expand -> Print -> Color Head -> FX -> Output`
- [ ] Defer deep preset research until real film parameter sources exist

Notes:

- Dehancer is intentionally not deeply implemented yet
- only the execution slots and architecture room are being preserved for now
- this is deliberate, because there is no stable in-repo film preset dataset yet

## Explicit Non-Goals For The Current State

- [ ] This is not yet a GPU-native editor kernel
- [ ] This is not yet a true tile-graph renderer
- [ ] This is not yet a full scene-referred color-managed pipeline
- [ ] This is not yet a finished Dehancer-style digital darkroom
- [ ] This is not yet a complete Luminar-style high-level layer engine

## Handoff Notes

These points are worth carrying forward for the next agent:

- The runtime boundary work is real, but the execution semantics are still transitional.
  `src/features/editor/renderGraph.ts` now carries `scopedLocalAdjustments`, but the actual local-adjustment render behavior is still driven by the older local re-render and blend path inside `src/lib/imageProcessing.ts`.

- Do not assume local adjustments are already true scoped graph nodes.
  Today they are represented in the graph, but not yet executed as first-class pipeline nodes with phase-aware ordering.

- `RenderDocument.layerEntries` is still a compatibility field.
  It should not be removed until every remaining consumer is graph-native and preview/export parity has been rechecked.

- `flattenLayers` is no longer disabled at the store layer.
  It now renders back into the document asset and resets the editor state to a single base layer.

- `mergeLayerDown` is no longer a pure placeholder, but it is still intentionally constrained.
  The current implementation only supports render-backed merge-down when the target layer is the base layer.
  Non-base targets remain unsupported until the editor has a safer raster backing model for intermediate layers.

- `mergeLayerDown` target resolution is now based on the real `layerStack`, not only `renderGraph.layers`.
  This avoids skipping hidden or otherwise non-renderable layers when determining the immediate merge target.

- The stale-plan guard is no longer only a render-graph check.
  The store now also verifies that authoring state has not changed before applying the baked result, so non-render edits like layer renames are not silently overwritten.

- Successful render-backed bake operations now clear editor history for that asset.
  This is deliberate because the current history model does not snapshot baked pixel payloads like `blob`, `objectUrl`, or `contentHash`.

- Materialization thumbnail generation no longer re-decodes the baked output blob.
  The thumbnail is derived from the render canvas directly to avoid the extra large-image decode and allocation spike.

- Multi-layer composition now goes through a real backend seam.
  `src/features/editor/renderGraphComposition.ts` is no longer the place where blend mode, mask generation, and final `drawImage` calls happen directly.
  It now renders layer surfaces, builds `CompositeLayerRequest[]`, and delegates the final composite to `src/features/editor/canvas2dCompositeBackend.ts`.

- The new seam is useful, but it is not yet GPU-neutral.
  `src/features/editor/compositeBackend.ts` still assumes `HTMLCanvasElement` layer surfaces and canvas scratch workspaces.
  That is fine for this round, but if Phase 2 continues toward GPU composition, expect this contract to widen or be replaced.

- Preview and export now both route multi-layer composition through `defaultCompositeBackend`.
  Single-layer fast paths still bypass the backend and call `renderImageToCanvas(...)` directly.
  Do not accidentally regress those fast paths while expanding the seam.

- A real regression was found immediately after the first seam refactor.
  The first version buffered layer surfaces and composed them later, but `renderDocumentCanvas.ts` still used one shared temporary `layerCanvas` for every layer.
  That broke multi-layer export/materialization because every queued layer request pointed to the last rendered canvas contents.
  This is now fixed by allocating temporary canvases per `layerId`.
  If you touch `createTemporaryWorkspace()` again, do not regress back to a shared layer surface model unless composition becomes immediate again.

- Preview performance regressed once when `graphKey` was used too aggressively.
  That regression has already been fixed and should not be reintroduced:
  - `sourceCacheKey` for preview must stay source-asset-stable, not render-graph-stable
  - preview `renderSlot` ids must stay document and layer stable, not graph-revision stable

- The relevant fixes are in these commits:
  - `5aa1fd3` `fix(editor): stabilize preview source cache keys`
  - `202a86a` `fix(editor): reuse stable preview render slots`
  - `570faa0` `refactor(editor): formalize composite backend seam`
  - `c42e261` `fix(editor): isolate deferred export layer surfaces`

- Some preview helpers are exported mainly for seam-level tests, not because they are stable public editor APIs.
  `createPreviewCanvasBucket` and `executePreviewRenderRequest` in `src/features/editor/preview/usePreviewRenderPipeline.ts` exist so caller-level preview tests can assert routing into the shared seam.
  If preview execution gets refactored again, consider moving them into a dedicated preview executor module instead of expanding the hook surface further.

- Test coverage around the seam is split intentionally:
  - `src/features/editor/renderGraphComposition.test.ts` covers real `canvas2d` backend behavior like ordering, opacity/blend mapping, masks, and ROI-limited redraw
  - `src/features/editor/renderDocumentCanvas.test.ts` and `src/features/editor/preview/usePreviewRenderPipeline.test.ts` mostly verify that export/preview route multi-layer work through the shared seam while preserving single-layer fast paths
  If backend selection becomes dynamic later, add a higher-level integration test instead of only extending the routing assertions.

- If preview pipeline work continues, keep an eye on these files first:
  - `src/features/editor/preview/usePreviewRenderPipeline.ts`
  - `src/features/editor/preview/requestUtils.ts`
  - `src/lib/imageProcessing.ts`
  - `src/lib/renderer/RenderManager.ts`

- If document and graph work continues, the main files to inspect first are:
  - `src/features/editor/document.ts`
  - `src/features/editor/renderGraph.ts`
  - `src/features/editor/renderGraphComposition.ts`
  - `src/features/editor/renderMaterialization.ts`
  - `src/features/editor/useEditorSlices.ts`

- The current highest-value unfinished work is still:
  - generalized render-backed `merge-down` beyond the current base-target-only path
  - replacing the current multi-layer CPU composite main path with a backend abstraction that can grow into GPU composite

- There are unrelated untracked local items in the repo root state that are not part of this editor work:
  - `%TEMP%/`
  - `test-assets/images/Snipaste_2026-03-12_01-32-49.png`
  Do not treat them as editor TODO unless the user explicitly asks.

- Validation already done for the preview regression fixes:
  - `pnpm test -- src/features/editor/preview/usePreviewRenderPipeline.test.ts src/features/editor/preview/requestUtils.test.ts src/features/editor/preview/usePreviewScheduler.test.ts src/lib/renderer/RenderManager.test.ts`
  - `pnpm build:client`

- Validation now also done for the render-backed materialization hardening work:
  - `pnpm test -- src/features/editor/renderMaterialization.test.ts src/features/editor/document.test.ts src/features/editor/preview/usePreviewRenderPipeline.test.ts src/stores/assetStore.materialization.test.ts`
  - `pnpm build:client`

- Validation now also done for the composite backend seam and its export fix:
  - `pnpm test -- src/features/editor/renderDocumentCanvas.test.ts src/features/editor/renderMaterialization.test.ts src/features/editor/renderGraphComposition.test.ts src/features/editor/preview/usePreviewRenderPipeline.test.ts src/stores/assetStore.materialization.test.ts`
  - `pnpm build:client`

## Recommended Next Step

If work continues immediately, the highest-value next tasks are:

1. generalize `mergeLayerDown` beyond `merge into base`
2. widen the current `canvas2d`-first compositing seam so non-canvas GPU surfaces can be introduced without changing preview/export callers again
