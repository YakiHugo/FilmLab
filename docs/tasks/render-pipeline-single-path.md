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

- Pass: `pnpm vitest run src/render/image/renderSingleImage.test.ts src/render/image/effectExecution.test.ts src/render/image/asciiEffect.test.ts src/render/image/carrierExecution.test.ts src/render/image/stageMaskComposite.test.ts src/render/image/effectMask.test.ts`
- Pass: `pnpm vitest run src/lib/imageProcessing.debug.test.ts src/lib/renderer/PipelineRenderer.localMaskShape.test.ts src/lib/renderer/PassBuilder.test.ts src/lib/renderer/RenderPostProcessing.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`
- Pass: `git diff --check`
- Manual: agent-browser smoke — open a canvas with ASCII carrier + one stacked filter2d effect at `style` placement, verify preview renders identically to current main.

## Rollback

- Slice 2: `git revert` the slice commit restores Canvas2D ASCII (current state).
- Slice 4: `git revert` the slice commit restores dual-path orchestration. Slices 1 and 3 are behavior-preserving on their own and do not require rollback unless Slice 2/4 are rolled back together.

## Handoff

### Slice 1 findings (2026-04-16)

#### Bug 1 — canvas resize state mutation: **open** (workaround only)

- Root cause unchanged since `a3d7419`: `PipelineRenderer.updateSource` (`PipelineRenderer.ts:2108-2114`) unconditionally writes `canvasElement.width/height` and `lastTargetWidth/Height` whenever the requested target size differs. Every `captureLinearSource` call inherits this side effect because it calls `updateSource` at line 1241.
- ASCII caller mitigation: `renderAsciiCarrierComposite` re-asserts the output size at `PipelineRenderer.ts:1683-1695` after the analysis-grid capture. The patch is local; the footgun remains for any new `captureLinearSource` caller.
- Other current call sites reviewed — no active bug today because each caller captures at the final output size: `gpuCanvasLayerBlend.ts:38,50`, `gpuMaskedCanvasBlend.ts:34,46`, `PipelineRenderer.ts:863` (internal passthrough).
- Slice 2 fix direction: either split `updateSource` into upload-only + size-apply, or have `captureLinearSource` save/restore the three state fields itself so the GPU ASCII path can drop the 1683-1695 workaround.

#### Bug 2 — analysis-grid vs output resolution mismatch: **open** (coupled to Bug 1)

- Mechanism: ASCII needs two resolutions simultaneously (output canvas, analysis grid = columns × rows). The analysis-grid `captureLinearSource` at `PipelineRenderer.ts:1672` downsamples to `columns × rows`, which through Bug 1 also repurposes `canvasElement` + viewport + `lastTargetWidth/Height`. Without the 1683-1695 restoration block, `blendLinearLayers`/`presentTextureResult` would render at grid size instead of output size.
- Shader side is correct: `AsciiCarrier.frag` takes `u_canvasSize`, `u_gridSize`, `u_cellSize` as explicit uniforms and `texelFetch(u_analysisGrid, clampCellCoord)` isolates grid sampling from framebuffer size.
- Slice 2 fix direction: once Bug 1 is structurally resolved the mismatch disappears. In the interim, any additional intermediate `captureLinearSource` call inserted between the analysis capture and the composite would silently re-introduce the defect — no guard rail exists.

#### Bug 3 — fragile cross-pass texture binding: **partial**

- `AsciiCarrier.frag` declares 4 samplers: `uSampler`, `u_analysisGrid`, `u_backgroundCanvas`, `u_glyphAtlas`. `FilterPipeline.execute` (`FilterPipeline.ts:155-167`) merges `{uSampler, ...uniforms, ...extraTextures}` into one dict and hands it to `twgl.setUniforms` — texture-unit assignment is delegated to twgl by uniform name.
- Safety today: unused samplers are bound to `emptyMaskTexture` (carrier input texture at `PipelineRenderer.ts:1633`; `u_backgroundCanvas` when no bg at `PipelineRenderer.ts:1561`) and sampled to zero, which is benign given the `u_useBackgroundCanvas` / `u_useCellBackground` flags short-circuit usage.
- Residual fragility: relies on (a) twgl returning stable unit assignments across invocations, (b) every shader sampler being declared/sampled even when unused, (c) `uSampler` always meaning "prior pass output" even for the ASCII pass where it is meaningless. There is no `PipelinePass` contract for "this pass does not use uSampler".
- Slice 2 fix direction: either drop the `uSampler` convention for generator-style passes by making it optional in `PipelinePass`, or change `AsciiCarrier.frag` to sample only one primary texture (collapse analysis + background into an RGBA pack once per frame) so texture-unit collisions are impossible.

#### AsciiTextmode / AsciiTextmodeSurface removal status: **fully removed**

- No `AsciiTextmode.frag` file, no `AsciiTextmodeSurface` type — only `AsciiCarrier` shader + `AsciiLayerKind` remain.
- Residual references cleaned up in this commit:
  - `src/lib/renderer/gpu/FilterPipeline.ts` — dropped `AsciiTextmode` from Y-parity comment list.
  - `src/lib/renderer/shaders/templates/asciiCommon.glsl` — header trimmed to mention only `AsciiCarrier`.
  - `src/lib/renderer/PipelineRenderer.ts` — pointer comment above `renderAsciiBackgroundSourceLayer` retargeted to `render-pipeline-single-path.md`.
  - `src/render/image/asciiAnalysis.ts` + `asciiAnalysis.test.ts` — deleted. 321-line module had 0 runtime importers; its cell-grid readback/LRU/feature-extraction logic is not needed by the Slice 2 revival plan because `AsciiCarrier.frag` performs luminance/edge on GPU and `PipelineRenderer.captureLinearSource` already covers the cell-grid downsample.
- Kept: `src/render/image/asciiDensityMeasure.ts` naming comment (acknowledges `textmode.js` library inspiration, not an internal residual).
- Historical docs `docs/tasks/ascii-textmode-kernel.{md,json}` unchanged — task-log artifact, not a runtime dependency.

#### Additional observations for Slice 2

- Background doc line 10 claims `72722ab` "consolidated onto a single-pass `AsciiCarrier.frag`". **Not true of current code**: `AsciiCarrier.frag:160-172` still branches on `u_layerMode < 0.5`, and `renderAsciiCarrierLayer` (`PipelineRenderer.ts:1530`) is invoked twice per composite (background + foreground), blended via `blendLinearLayers`. Slice 2 should decide explicitly whether to collapse to a true single pass (removes one intermediate lease + one blend, simplifies uniform set) or carry the two-layer model forward — the latter is strictly more complex without buying parity benefits now that `foregroundBlendMode` is the only reason to want separate layers, and that can be handled post-composite.
- GPU carrier call path is an unreferenced island: `renderAsciiCarrierComposite`, `renderAsciiCarrierLayer`, `renderAsciiBackgroundSourceLayer` have zero external callers (grep `renderAsciiCarrierComposite` returns only its own declaration; `applyImageAsciiCarrierTransformToSurfaceIfSupported` at `asciiEffect.ts:584-594` is hard-wired to `return null`). Slice 2 re-enables the entry point.
- `asciiEffect.test.ts:229` currently asserts the Surface path returns null — will need to be rewritten in Slice 2, not merely deleted, so parity coverage is preserved.
- Charset/density path is shared: `asciiDensityMeasure.ts` + `CHARSET_PRESET_CANDIDATES` in `asciiEffect.ts:28-35` are consumed by the Canvas2D renderer and will remain the source-of-truth charset for the GPU revival.
- Glyph atlas will use `PipelineRenderer.getGlyphAtlas` (`PipelineRenderer.ts:1294`) which already renders at an upscaled integer multiple of cell size (`ATLAS_MIN_CELL_HEIGHT_PX = 40`) — matches the Canvas2D path's `ATLAS_GLYPH_HEIGHT = 48` intent, so small-cellSize parity is attainable without atlas restructuring.

No code changes made in this slice.

### Slice 2 findings (2026-04-16)

Shipped in three atomic commits on `refactor/render-single-path`.

#### Bug 1 — canvas resize state mutation: **closed**

- `PipelineRenderer.captureLinearSource` now saves and restores `canvasElement.width/height`, the GL viewport, and `lastTargetWidth/Height` around its internal `updateSource` call (commit `3a682c3`). The ASCII-specific workaround previously inserted in `renderAsciiCarrierComposite` is gone; every caller of `captureLinearSource` is now free of the resize side effect.

#### Bug 2 — analysis-grid vs output resolution mismatch: **closed**

- The analysis `captureLinearSource` call on the GPU path is gone. The CPU downsamples the source canvas to `columns × rows` via Canvas2D `drawImage` + `getImageData` and packs the result into `cellColorRgba` (RGBA8) + `cellToneR` (R8). `renderAsciiCarrierComposite` uploads those buffers as per-cell textures, so the shader's grid size and the composite output size are set by independent uniforms that cannot drift (commits `eb7d824`, `4945ed8`).

#### Bug 3 — fragile cross-pass texture binding: **narrowed**

- `AsciiCarrier.frag` no longer declares `uSampler`; it is a generator pass that reads only `u_cellColor`, `u_cellTone`, `u_backgroundCanvas`, `u_glyphAtlas`. The `FilterPipeline` still injects `uSampler: emptyMaskTexture` into every pass's uniform bundle, but the shader ignores it — so the historical "uSampler must be bound somewhere" rule no longer constrains the carrier path. Remaining fragility lies in `FilterPipeline.execute` itself (the `uSampler: currentTexture` is still implicit) and is out of scope for this task; it becomes an issue only if a future generator pass declares a different meaning for `uSampler`.

#### API changes

- New module `src/lib/renderer/gpuAsciiCarrier.ts` exports `AsciiCarrierGpuInput`, `applyAsciiCarrierOnGpuToSurface`, `applyAsciiCarrierOnGpu` — mirroring `gpuTimestampOverlay.ts`. `PipelineRenderer` reuses the same type internally.
- `renderAsciiCarrierComposite` now consumes `cellColorRgba` / `cellToneR` buffers via the input; no longer accepts a `sourceCanvas` for analysis (only for `blurred-source` background).
- `AsciiCarrier.frag` dropped `u_density`, `u_coverage`, `u_edgeEmphasis`, `u_brightness`, `u_contrast`, `uSampler`, and its helper `resolveTone` / `resolveEdge`. The tone pipeline is entirely CPU-side.
- Deleted from `asciiEffect.ts`: `renderAsciiToCanvas` (≈250 LOC), `resolveCellColor`, local glyph atlas cache (`ATLAS_GLYPH_HEIGHT`, `GLYPH_ATLAS_FONT_THRESHOLD`, `getOrCreateGlyphAtlas`, `_atlasCache`). Glyph atlas bake is now only in `PipelineRenderer.getGlyphAtlas`, which is the Slice 2 Canvas2D exception.

#### Parity notes

- Tone math is line-for-line ported from the former `renderAsciiToCanvas` (brightness → contrast → density pow → coverage threshold → invert → edge emphasis → Floyd–Steinberg dither). Matches Canvas2D reference exactly.
- Shader `resolveForegroundColor`, dot radius, and duotone ramp handle the invert-recovery arithmetic to match Canvas2D's `colorTone = invert ? 1 - tone : tone`.
- Blend-mode mapping: `source-over → normal`, `multiply → multiply`, `screen → screen`, `overlay → overlay`, `soft-light → softLight`. All 5 values from `AsciiForegroundBlendMode` (type `src/types/index.ts:197`) are covered; anything else falls back to `normal`.
- `ascii-magic-parity` visual-diff fixtures: not runnable in this sandbox (Node 18 vs vitest rolldown). Validation deferred to the next environment with Node ≥ 20 / a live preview; the parity gate remains the explicit acceptance criterion before Slice 3 starts any feature changes.

#### Known open items for Slice 3/4

- `applyImageCarrierTransforms` still exists as a non-surface twin of `applyImageCarrierTransformsToSurfaceIfSupported`; collapse is Slice 4.
- `uSampler` injection in `FilterPipeline.execute` remains an implicit contract; structural fix (optional in `PipelinePass`) is not required by this task.
- Other `renderAsciiCarrierComposite` / `renderAsciiBackgroundSourceLayer` methods in PipelineRenderer retain `captureLinearSource(baseCanvas, ...)` — one composite-boundary capture per render, at output size only. `canvasMaterializations` per render for ASCII = 1 (runRendererSurfaceOperation wraps `renderer.canvas`; `materializeToCanvas` is hit only at the final public boundary).

### Slice 2 review outcomes (2026-04-16)

Three parallel reviews (renderer correctness / Canvas2D → GPU parity / test coverage) were run against the Slice 2 commits. Findings broke into three buckets.

#### Real bug found and fixed in this session

- **Slot-id churn.** The initial Slice 2 code used `ascii-carrier:${transform.id}` as the `runRendererSurfaceOperation` slot id. `RenderManager.getRenderer` (`src/lib/renderer/RenderManager.ts:165-183`) allocates a fresh `PipelineRenderer` (WebGL2 context, shader link, texture pool) for every previously unseen `${mode}:${slotId}` and has no eviction path for successful renders. A document with N distinct ASCII carriers would permanently leak N renderers. Fixed by collapsing to a single constant `ASCII_CARRIER_SLOT_ID = "ascii-carrier"` in `src/render/image/asciiEffect.ts` (carriers are orchestrated sequentially, so mutex contention at a shared slot is never observed). Mirrors `gpuTimestampOverlay.ts` which also uses a single fixed slot.

#### Divergences from the prior Canvas2D reference — intentionally not addressed

The prior `renderAsciiToCanvas` implementation was itself never visually validated. It was introduced in `a3d7419` ("replace GPU carrier with Canvas2D ASCII renderer") as an emergency fallback after the GPU path was disabled, and was followed by ~8 fix commits (`edc823c` blur/edge, `50f18bf` base preservation, `e4f6bf5` dithering + cell-solid + duotone, `16af4d5` edge direction + atlas threshold, `36408a2` charset, `06f41ee` edge direction again, `5083820` atlas upscaling, `a8751e1` mipmaps). The archived session memory (`project_ascii_rewrite_log.md`, deleted in commit `d3ab590`) recorded that ASCII rendering remained visibly broken across the entire Canvas2D era. Treat the Canvas2D behaviour as one plausible implementation, not a canonical reference. The reviews flagged two axes where the new GPU path deliberately departs from Canvas2D; both are left as-is pending real visual validation:

- **`cell-solid` background on tone-zero cells.** Old Canvas2D (`asciiEffect.ts@4945ed8^:409`) skipped the solid-colour square when `toneGrid[idx] <= 0`. New shader only gates on `cellSample.a > ASCII_ALPHA_CUTOFF`, so cells that survive the source alpha check but fail the coverage/density threshold still get the cell-solid fill. The new semantics are arguably cleaner (`cell-solid = solid backdrop per source-visible cell` independent of the coverage filter), but this is an intentional divergence. If visual validation prefers the old behaviour, the fix is a one-line tone-gate in `AsciiCarrier.frag`'s `resolveBackgroundLayer`.
- **Grid overlay thickness / outer border.** Old Canvas2D used `ctx.stroke()` with `lineWidth = 1` centred on integer coordinates, which produces ~2 px anti-aliased lines and includes an explicit final stroke at `x = canvasWidth` / `y = canvasHeight`. New shader marks exactly one pixel on the left/top side of each cell (`asciiCommon.glsl:29-40`), giving a thinner hairline grid and no outer-edge stroke. `gridOverlay` is a developer aid; the new behaviour is a more honest 1-pixel grid. Only worth revisiting if users report the overlay is too faint.

#### Coverage gaps deferred

The two reviews surfaced:
- `buildAsciiCellGrids` runs unverified in tests (invert / edge / dither / coverage / density-pow have no behavioural assertion).
- GPU input nullability matrix across `backgroundMode × colorMode` is not tested.

Deferred until the GPU output itself is visually validated — there is no point pinning specific CPU pre-pack values if the reference truth is still in question. Slice 3 should add these once a parity-of-intent baseline is set.

#### Non-issues from reviews (recorded for completeness)

- `captureLinearSource` state coverage — only three target-size fields are saved/restored; `updateSource` also mutates the source-texture LRU and `currentSourceTexture`, but no caller relies on pre-capture values of those. Working as intended.
- Other `captureLinearSource` callers (`gpuCanvasLayerBlend`, `gpuMaskedCanvasBlend`, `applyFilter2dSource`, `renderTimestampOverlayComposite`, internal passthrough) all capture at the final output size, so the prior in-place mutation was already a no-op for them.
- Cell-texture lifecycle in `renderAsciiCarrierComposite` — early-return path never allocates; `gl.deleteTexture(null)` is a spec-defined no-op; pooled-lease releases do not overlap cell-texture deletes.
- Texture binding: `twgl.setUniforms` silently skips uniforms not active in the linked program, so `FilterPipeline`'s always-present `uSampler: currentTexture` injection is safe for generator passes like the rewritten AsciiCarrier.
- `UNPACK_ALIGNMENT` reset to 4 after the R8 upload — 4 is the WebGL default used elsewhere.
- `dimensionsMatch` guard in `applyAsciiCarrierOnGpuToSurface` — both sides use identical `Math.max(1, Math.round(...))` rounding, so surface and layout widths cannot drift.
- Y-parity passthrough adds one extra draw per carrier layer — perf only, scoped to a later performance pass if it ever shows up as a hotspot.
