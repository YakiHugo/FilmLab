# GPU Surface Graph Consolidation

- Status: done
- Scope: consolidate isolated renderer-backed helper islands behind a shared surface-operation layer, then move high-frequency image stages to consume renderer surfaces before materializing back to external canvases.

## Goal

- Reduce avoidable `renderer.canvas -> targetCanvas` round-trips across auxiliary GPU helpers.
- Prefer passing `RenderSurfaceHandle` between GPU-capable stages where the next consumer is still within the image pipeline.
- Keep authored state, scene/global ownership, and public canvas-facing APIs unchanged.

## Slice Plan

### Slice 1. Shared Auxiliary Surface Operations

- Replace per-helper `RenderManager + mutex` ownership with one shared auxiliary renderer-surface operation layer.
- Keep helper-specific slot ids so operation families remain isolated.
- Land the first surface-aware caller on the highest-frequency helper path: unmasked `filter2d`.

### Slice 2. Surface-Aware Effect Chaining

- Use surface-aware `filter2d` for:
  - develop effects before film-stage
  - style effects when no carrier stage forces an early canvas materialization
- Fall back to the historical canvas/effect path when masked effects or unsupported GPU execution is encountered.

### Slice 3. Follow-up Consolidation

- Move local-mask shape and local-mask range gating to reusable renderer surfaces internally so `shape -> range gate -> final mask canvas` materializes only once.
- Leave masked blend on its canvas-facing boundary until a later slice, because its output is still usually the final consumer.

### Slice 4. Full-Frame Surface Return Through Local Composition

- Allow full-frame local-adjustment HDR composition to return a renderer-slot surface instead of forcing an output-canvas materialization.
- Allow masked `filter2d` effect chaining on renderer surfaces for:
  - develop effects before film-stage
  - style effects when there is no carrier stage
- Keep masked-stage fallback behavior intact for unsupported effect types or GPU-unavailable paths.

## Validation Boundary

- No authored-state or public API changes.
- Develop/style stage ordering must not change.
- Masked effect behavior must still fall back safely.
- New surface-aware paths must preserve:
  - film-stage source selection
  - debug trace ordering
  - canvas materialization counts for the optimized develop path

## Validation

- Pass: `pnpm vitest run src/render/image/effectExecution.test.ts src/render/image/renderSingleImage.test.ts`
- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts src/render/image/stageMaskComposite.test.ts src/render/image/effectMask.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`
- Pass: `git diff --check`

## Handoff

- Slice 1 and Slice 2 are landed:
  - auxiliary GPU helpers now share one renderer-surface operation layer
  - unmasked develop/style `filter2d` effects can stay on renderer surfaces until a later materialization boundary
- Slice 3 is partially landed:
  - local-mask shape and range-gate helpers can now return reusable surfaces
  - `imageProcessing` and `effectMask` chain GPU `shape -> range gate` before materializing the final mask canvas
  - masked-stage composition now avoids cloning a separate base canvas before GPU blend
- Slice 4 is landed:
  - full-frame local-adjustment HDR composition can now return a renderer-slot surface from `render*ToSurface(...)`
  - masked `filter2d` effects can remain on renderer surfaces through develop/style paths when the stage ordering allows it
- Accepted steady-state boundary:
  - masked blend remains canvas-facing at its final consumer edge
  - brush-mask rasterization and ASCII remain separate follow-up tasks
- Do not widen this task into brush-mask GPU rasterization or scene-level preview invalidation; those remain separate follow-ups.
