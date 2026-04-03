# GPU Brush Mask Rasterization

- Status: done
- Scope: move local/effect brush-mask shape rasterization to a GPU-first renderer path while keeping the existing CPU brush painter as fallback.

## Goal

- Reduce CPU canvas work for high-frequency brush-mask previews.
- Keep the existing `LocalBrushMask` document shape, ROI transform rules, and mask range-gate behavior unchanged.
- Restrict this task to brush-shape rasterization only; do not widen it into ASCII, scene/global invalidation, or brush data-model changes.

## Slice Plan

### Slice 1. Conservative GPU Dab Accumulation

- Teach `PipelineRenderer.renderLocalMaskShape(...)` to accept `mask.mode === "brush"`.
- Rasterize brush points as GPU dab passes over a transparent mask surface.
- Preserve current semantics for:
  - `pressure`
  - `feather`
  - `flow`
  - ROI `fullWidth/fullHeight/offsetX/offsetY`
  - `invert`
- Keep a conservative point-count cap; large point arrays still fall back to the historical CPU painter for now.
- Result:
  - `brush` now shares the GPU-first local-mask shape entrypoint used by radial/linear masks.
  - Empty inverted brush masks render as a valid full-mask GPU result.
  - Oversized point arrays still return `false` so higher layers fall back safely.

## Validation Boundary

- No authored-state or public API changes.
- ROI-relative brush previews must keep the same anchor and radius math as the CPU painter.
- `invert` must still produce a valid full-mask result when the brush has zero points.
- Large brush point sets must fail safe by returning `false` from the GPU path so higher layers fall back to CPU.

## Validation

- Pass: `pnpm vitest run src/lib/renderer/PipelineRenderer.localMaskShape.test.ts`
- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts src/render/image/effectMask.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`
- Pass: `git diff --check`

## Handoff

- Slice 1 is intended as a bounded GPU-first step, not a complete brush system rewrite.
- If brush-mask GPU work is still hot after this slice, the next follow-up should reduce per-dab fullscreen pass count instead of widening fallback thresholds.
