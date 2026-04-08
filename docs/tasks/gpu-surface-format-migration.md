# GPU Surface / Format Boundary Migration

- Status: done
- Scope: reduce avoidable GPU/CPU handoff and canvas duplication inside the per-image runtime without changing authored state, scene/global ownership, or public canvas document schemas.

## Current State

- `src/lib/imageProcessing.ts` now exposes surface-aware low-level stage results, tracks boundary counters, prefers `ImageBitmap` for preview-friendly decode paths, and avoids pre-materializing an oriented canvas on CPU geometry/tile/fallback paths.
- `src/render/image/renderSingleImage.ts` now clones stage snapshots only when an immutable reference is actually needed by masked stages or analysis consumers.
- Unmasked `filter2d` effects and unmasked carrier transforms now bypass the masked-stage wrapper and avoid extra base/effect/mask layer duplication.
- Masked stage blending now prefers a renderer-backed GPU blend path and falls back to CPU `ImageData` composition only when that renderer path is unavailable.
- `filter2d` now prefers a renderer-backed GPU post-process path and falls back to the historical Canvas2D filter implementation only when the renderer path is unavailable.
- Local-mask luma/hue/saturation range gating now prefers a renderer-backed GPU pass and falls back to CPU pixel reads only when that renderer path is unavailable.
- Full-frame and ROI-sized local-adjustment output composition now prefer renderer-backed GPU masked blending.
- Linear/radial local-mask shape generation now prefers renderer-backed GPU mask shaders; brush masks remain on CPU as the accepted non-geometric fallback.
- Preview/export callers still consume the canvas-facing public APIs.

## Slice Plan

### Slice 1. Surface Contract And Boundary Instrumentation

- Add an internal `RenderSurfaceHandle` contract for low-level stage results.
- Keep public `render*ToCanvas(...)` APIs intact, but add surface-aware internal/companion entrypoints.
- Extend debug traces with:
  - `outputKind`
  - `textureUploads`
  - `canvasMaterializations`
  - `canvasClones`
  - `cpuPixelReads`

### Slice 2. Snapshot / Mask Copy Reduction

- Only clone stage snapshots when an immutable reference frame is actually required.
- Bypass masked-stage composition entirely for unmasked `filter2d` effects and unmasked carrier transforms.
- Keep masked paths behaviorally identical, with CPU composition retained as fallback.

### Slice 3. Source / Geometry Boundary Tightening

- Prefer `ImageBitmap` for preview-path decoded string/blob sources when available.
- Reduce redundant CPU canvas hops around orientation handling and CPU geometry prepass.

### Slice 4. GPU Effect / Mask Migration Follow-up

- Move GPU-capable `filter2d` work and local-adjustment mask/blend hotspots onto renderer-native paths.
- Keep authored-state semantics and stage ordering unchanged.
- Range-gated local masks should prefer a renderer-native path before falling back to CPU `ImageData`.

## Validation Boundary

- No authored-state shape changes.
- No scene/global composition changes.
- Preview geometry correctness must remain intact: crop, orientation, ROI offset, alpha, and tile assembly.
- Slice 1/2 validation must cover:
  - repeated preview renders on the same slot
  - unmasked `filter2d`
  - unmasked carrier transforms
  - masked effect fallback
  - tile export fallback traces

## Files

- `src/lib/imageProcessing.ts`
- `src/lib/renderSurfaceHandle.ts`
- `src/render/image/renderSingleImage.ts`
- `src/render/image/effectExecution.ts`
- `src/render/image/effectExecution.test.ts`
- `src/render/image/carrierExecution.ts`
- `src/lib/renderer/PipelineRenderer.ts`
- `src/lib/renderer/gpuMaskedCanvasBlend.ts`
- `src/lib/renderer/gpuFilter2dPostProcessing.ts`
- `src/lib/renderer/gpuLocalMaskRangeGate.ts`
- `src/lib/renderer/gpuLocalMaskShape.ts`
- `src/lib/filter2dShared.ts`
- `src/lib/localMaskShared.ts`
- `src/lib/renderer/shaders/Filter2dAdjust.frag`
- `src/lib/renderer/shaders/Dilate.frag`
- `src/lib/renderer/shaders/LocalMaskRangeGate.frag`
- `src/lib/imageProcessing.debug.test.ts`
- `src/render/image/stageMaskComposite.ts`
- `src/render/image/stageMaskComposite.test.ts`
- `src/render/image/effectMask.ts`
- `src/render/image/effectMask.test.ts`

## Validation

- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts`
- Pass: `pnpm vitest run src/render/image/renderSingleImage.test.ts`
- Pass: `pnpm vitest run src/render/image/effectExecution.test.ts`
- Pass: `pnpm vitest run src/render/image/stageMaskComposite.test.ts`
- Pass: `pnpm vitest run src/render/image/effectMask.test.ts`
- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts src/render/image/effectMask.test.ts src/render/image/stageMaskComposite.test.ts src/render/image/effectExecution.test.ts src/render/image/renderSingleImage.test.ts`
- Pass: `pnpm vitest run src/lib/renderer/PassBuilder.test.ts src/lib/renderer/RenderPostProcessing.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`

## Handoff

- Slice 1 through Slice 4 are landed.
- The accepted steady-state boundary is:
  - GPU-first for masked stage blend, `filter2d`, local-mask range gating, local-adjustment output composition, and linear/radial mask shape generation.
  - CPU fallback for renderer-unavailable cases and CPU-owned brush mask rasterization.
- Do not widen authored-state or scene/global APIs from this task; follow-on work belongs in separate tasks only if brush-mask GPU execution becomes a measured hotspot.
- Keep `docs/tasks/media-native-render-pipeline.md` as the authored-state roadmap; this task only covers execution/runtime boundaries.
