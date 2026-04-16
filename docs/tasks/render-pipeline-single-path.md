# Render Pipeline Single-Path Convergence

- Status: in_progress
- Scope: complete the GPU-first migration for the per-image render pipeline by reinstating ASCII on GPU, auditing any remaining CPU escape hatches, and collapsing the dual `RenderSurfaceHandle` / `HTMLCanvasElement` orchestration in `renderSingleImage.ts` into a single Surface→Surface contract.

## Background

- 2026-04-02/03 (PR #41, tasks `gpu-surface-format-migration`, `gpu-surface-graph-consolidation`): GPU-first runtime landed with an intentional CPU fallback boundary. ASCII/carrier and brush mask were called out as follow-ups.
- 2026-04-08..11 (`ascii-textmode-kernel`, `ascii-magic-parity`): GPU ASCII path reached functional parity with ascii-magic target (packed cell surface, glyph atlas, single-pass compositing).
- 2026-04-12 `72722ab`: rewrote ASCII core, dropped the two-layer textmode shader path, consolidated onto a single-pass `AsciiCarrier.frag` with `u_backgroundOpacity`.
- 2026-04-12 `a3d7419`: replaced the GPU ASCII carrier with a Canvas2D renderer to stop three integration bugs: canvas resize state mutation, analysis-grid vs output resolution mismatch, fragile cross-pass texture binding. `applyImageAsciiCarrierTransformToSurfaceIfSupported` now returns `null`; `AsciiCarrier.frag` is marked NOT CURRENTLY REACHED.
- Current symptom: `renderSingleImage.ts` ≈ 508 lines of Surface/Canvas dual-path bookkeeping (`applyXxxToSurfaceIfSupported`, `trackSurfaceClone`, `trackSurfaceMaterialization`, `canvas.width = 0` hand-roll GC, multiple `*AppliedOnSurface` flags). Two rounds of ASCII rewrites failed to stabilize output because fixes stayed inside the Canvas2D leaf while the structural issue is the dual-path orchestration plus the disabled GPU ASCII switch.

## Decisions

- Backend stays WebGL2. WebGPU is out of scope; a shader-backend abstraction is not a prerequisite.
- Canvas2D survives only inside the glyph atlas bake step (one-shot per charset/font), encapsulated behind the ASCII stage's Surface boundary. No in-flight stage returns or consumes an `HTMLCanvasElement`.
- No dual path. `*IfSupported` fallback branches are retired, not widened; per AGENTS.md the project is pre-launch and dual paths are not kept by default.
- Visual parity target is the current Canvas2D ASCII output across the four `ascii-magic-parity` feature checkpoints. Any parity regression blocks the slice.

## Goal

- Every per-image stage consumes and returns a `RenderSurfaceHandle`. `applyXxxToSurfaceIfSupported` → `applyXxx`; `null` returns for "stage has no GPU impl" are gone.
- `renderSingleImage.ts` ≤ ~200 lines of orchestration; `canvasMaterializations` in debug trace = 1 per render (single final boundary before returning the public canvas-facing API).

## Non-goals

- WebGPU migration, shader backend abstraction, WGSL ports.
- Authored state / public `render*ToCanvas` / scene API changes.
- Any new ASCII or effect feature beyond current `ascii-magic-parity` + `ascii-textmode-kernel` feature set.
- `canvas-preview-performance-followup` preview-executor split (separate task).

## Slice Plan

### Slice 1. GPU ASCII path diagnostic

- Read current state of `AsciiCarrier.frag` and any surviving `PipelineRenderer` ASCII methods.
- For each bug called out in `a3d7419`, classify as `fixed` / `partial` / `open` with file/line anchors:
  - canvas resize state mutation
  - analysis-grid vs output resolution mismatch
  - fragile cross-pass texture binding
- Additionally: confirm whether `AsciiTextmode.frag` remnants and `AsciiTextmodeSurface`-era types are fully removed or still present as dead code.
- Output: findings appended to this markdown under **Handoff → Slice 1 findings**. No code changes.

### Slice 2. GPU ASCII path reinstatement

- Fix the residual bugs from Slice 1.
- Re-enable `applyImageAsciiCarrierTransformToSurfaceIfSupported` to return a non-null `RenderSurfaceHandle` for all supported modes (glyph / dot / grayscale / full-color / duotone / cell-solid bg / blurred-source bg).
- Keep glyph atlas bake on Canvas2D, strictly inside the ASCII module; its output is a GPU texture handed to the carrier shader.
- Delete or demote the Canvas2D `renderAsciiToCanvas` path once the GPU path covers all current feature flags; leave only the atlas bake.
- Parity gate: fixture-based visual diff within tolerance against pre-change Canvas2D output for each `ascii-magic-parity` checkpoint (dithering, cell-solid bg, glyph-quality at cellSize=8, blur consistency).

### Slice 3. Effect-type / carrier-type coverage audit

- Enumerate every `ImageEffectNode["type"]` and `CarrierTransformNode["type"]` value present in `types.ts` and referenced in state normalization.
- For each, verify a GPU implementation exists end-to-end; classify any gap as (a) feasible on GPU in this task, (b) an internal CPU island that must be wrapped so its Surface-out contract holds, (c) genuinely permanent CPU (none expected).
- Close (a) inline; encapsulate (b). Any (c) blocks Slice 4 and must be escalated.
- Re-check `gpu-brush-mask-rasterization` scope: its single completed slice (`conservative_gpu_dab_accumulation`) may not cover every brush stroke case — verify against `renderSingleImage.ts` call sites before declaring brush-mask compliant.

### Slice 4. Dual-path orchestration collapse

- Retire `applyImageEffectsToSurfaceIfSupported` → `applyImageEffects` (Surface-in/Surface-out, mandatory).
- Same for `applyImageCarrierTransformsToSurfaceIfSupported`, `applyImageOverlaysToSurfaceIfSupported`.
- Delete the canvas-facing companions (`applyImageEffects` current form, `applyImageCarrierTransforms` current form, `applyImageOverlaysToCanvasIfSupported`) or compress them into a single final-materialization helper.
- Rewrite `renderSingleImage.ts` to hold one `RenderSurfaceHandle` variable through the full stage chain; drop `trackSurfaceClone`, `trackSurfaceMaterialization`, `styleEffectsAppliedOnSurface` / `overlaysAppliedOnSurface` / `finalizeEffectsAppliedOnSurface` flags, per-stage `canvas.width = 0` cleanup.
- Single materialization boundary immediately before the public canvas-facing return.
- Snapshot / analysis-source plumbing for carriers (`developSnapshotCanvas`, `carrierAnalysisSnapshotCanvas`) stays only where a carrier explicitly declares `analysisSource`; lifetime is bound to the stage result, not to the outer orchestrator.

## Validation Boundary

- No authored-state or public `render*ToCanvas` API changes.
- Stage ordering unchanged: develop → (develop effects) → film → carrier → style effects → overlays → finalize effects → output encode.
- Masked effect pixels unchanged against pre-change reference.
- ASCII visual parity against pre-change Canvas2D output on fixture set.
- `canvasMaterializations` in debug trace must be ≤ current count per slice; after Slice 4 it must equal 1.
- No behavior change to `canvas-preview-performance-followup` surface; preview executor split remains a separate task.

## Validation

- Pass: `pnpm vitest run src/render/image/renderSingleImage.test.ts src/render/image/effectExecution.test.ts src/render/image/asciiEffect.test.ts src/render/image/asciiAnalysis.test.ts src/render/image/carrierExecution.test.ts src/render/image/stageMaskComposite.test.ts src/render/image/effectMask.test.ts`
- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts src/lib/renderer/PipelineRenderer.localMaskShape.test.ts src/lib/renderer/PassBuilder.test.ts src/lib/renderer/RenderPostProcessing.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`
- Pass: `git diff --check`
- Manual: agent-browser smoke — open a canvas with ASCII carrier + one stacked filter2d effect at `style` placement, verify preview renders identically to current main.

## Rollback

- Slice 2: `git revert` the slice commit restores Canvas2D ASCII (current state).
- Slice 4: `git revert` the slice commit restores dual-path orchestration. Slices 1 and 3 are behavior-preserving on their own and do not require rollback unless Slice 2/4 are rolled back together.

## Handoff

- (populated per slice on completion)
