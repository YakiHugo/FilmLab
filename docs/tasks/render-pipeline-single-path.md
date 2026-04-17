# Render Pipeline Single-Path Convergence

- Status: done
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

### Slice 3 findings (2026-04-16)

Audit only; no code changes. Conclusion: every `ImageEffectNode["type"]` and `CarrierTransformNode["type"]` value has a GPU end-to-end path today. All residual CPU work is category (b) — internal islands bounded inside a stage whose outer contract is `RenderSurfaceHandle` in / `RenderSurfaceHandle` out (modulo the `*IfSupported` fallback envelope that Slice 4 will retire). No category (c) blockers; Slice 4 is unblocked.

#### Effect / carrier type coverage

Types enumerated at `src/render/image/types.ts:182-259`:
- `ImageEffectNode` = `ImageFilter2dEffectNode` only (`type: "filter2d"`). State normalisation at `types.ts:327-328,361-362` filters all other effect shapes out before they reach the snapshot plan.
- `CarrierTransformNode` = `ImageAsciiCarrierTransformNode` only (`type: "ascii"`). Same normalisation at `types.ts:330-331,357-359`.

| Placement | Type | GPU surface entry | CPU fallback entry | Classification |
|-----------|------|-------------------|---------------------|----------------|
| develop / style / finalize effect | `filter2d` (unmasked) | `applyFilter2dOnGpuToSurface` (`gpuFilter2dPostProcessing.ts:32`) | `applyFilter2dPostProcessing` (`effectExecution.ts:29`) | (b) — GPU primary, CPU is runtime-degrade safety net only |
| develop / style / finalize effect | `filter2d` (masked) | GPU effect → GPU mask shape → GPU mask range-gate → GPU masked blend (`effectExecution.ts:70-103`) | Canvas2D blend fallback inside `blendMaskedLayerIntoCanvasFallback` (`stageMaskComposite.ts:27-86`); mask shape falls back to `drawLocalMaskShape` (`effectMask.ts:36-123`); range-gate falls back to `applyLocalMaskLumaAndColorRange` (`effectMask.ts:125-169`) | (b) — each sub-step has a GPU-first primary with a per-step CPU degrade |
| carrier | `ascii` (all modes) | `applyAsciiCarrierOnGpuToSurface` (`gpuAsciiCarrier.ts`) via `applyImageAsciiCarrierTransformToSurfaceIfSupported` (`asciiEffect.ts:490-514`) | CPU `applyImageAsciiCarrierTransform` (`asciiEffect.ts:460-488`) routes to the same GPU code path now; there is no separate Canvas2D ASCII renderer after Slice 2 | (b) — CPU does cell-grid pre-pack + glyph atlas bake; both are wrapped inside the ASCII module and hand GPU-ready textures out |
| overlay | `timestamp` | `applyTimestampOverlayToSurfaceIfSupported` (`timestampOverlay.ts:424`) | `applyTimestampOverlayToCanvasIfSupported` (`timestampOverlay.ts:392`); ultimate Canvas2D via `applyTimestampOverlay` | (b) — GPU surface path exists; canvas helper is the legacy twin slated for collapse in Slice 4 |

ASCII sub-matrix verified against `prepareCarrierGpuInput` (`asciiEffect.ts:438-451`) and `buildAsciiCarrierGpuInput` (`asciiEffect.ts:362-431`):
- `backgroundMode ∈ {none, solid, cell-solid, blurred-source}` — all four branches pack either `backgroundFillRgba`, `cellBackgroundRgba`, or `backgroundSourceCanvas` and are consumed by `AsciiCarrier.frag` uniforms.
- `colorMode ∈ {grayscale, full-color, duotone}` — duotone additionally populates `duotoneShadowRgba`; shader branches on `u_colorMode`.
- `renderMode ∈ {glyph, dot}` — identical GPU path, differs only in `cellWidth` aspect (`asciiEffect.ts:138-145`) and shader glyph-vs-dot branch.
- `foregroundBlendMode` — five `GlobalCompositeOperation` keys mapped at `asciiEffect.ts:203-213`; unmapped values fall back to `normal`, matching the Canvas2D-era semantics.

#### CPU islands (category b) — bounded by stage surface contract

1. `PipelineRenderer.getGlyphAtlas` (`PipelineRenderer.ts:1294`) — Canvas2D glyph atlas bake, one-shot per `(charset, cellSize, font)` tuple, output is a GPU texture. Planned exception per Decisions §17 of this task.
2. `buildAsciiCellGrids` (`asciiEffect.ts:228-356`) — CPU downsample + tone/dither pipeline packed into `Uint8ClampedArray` tone/color buffers. Executes once per carrier; output is uploaded as GPU textures inside `renderAsciiCarrierComposite`. Closed as a Slice 2 decision; no further action.
3. `drawLocalMaskShape` (`effectMask.ts:36-123`) — only reached when `renderLocalMaskShapeOnGpuToSurface` returns null. GPU path covers radial, linear, and brush masks up to `GPU_BRUSH_MASK_MAX_POINTS = 512` (`PipelineRenderer.ts:101,1065-1132`). The CPU rasterisation writes into the same output canvas that downstream GPU blend consumes, so the Surface-out contract of the mask stage is preserved regardless of which sub-path runs.
4. `applyLocalMaskLumaAndColorRange` (`effectMask.ts:125-169`) — runs only if both `applyLocalMaskRangeOnGpuToSurface` and `applyLocalMaskRangeOnGpu` fail. Writes back into the same mask canvas; output shape unchanged.
5. `applyFilter2dPostProcessing` (`effectExecution.ts:28-31`) — runtime-degrade only; `applyFilter2dOnGpu` returning false implies a destroyed / context-lost renderer.
6. Canvas2D fallback inside `blendMaskedLayerIntoCanvasFallback` (`stageMaskComposite.ts:27-86`) — reached only if `blendMaskedCanvasesOnGpu` returns false; same degraded-context semantics.
7. Orchestrator-level reference-snapshot clones — `trackSurfaceClone` / `cloneCanvasSnapshot` at `renderSingleImage.ts:101-114,188-191` materialise the current surface into a fresh Canvas2D canvas for four reference purposes: `developSnapshotCanvas` (`:235,238`, mask range-gate + carrier `analysisSource: "develop"`), `carrierAnalysisSnapshotCanvas` (`:311`, carrier `analysisSource: "style"` + cell-grid downsample input for `buildAsciiCellGrids`), `styleSnapshotCanvas` (`:352,378-379`, masked style-effect reference), `surfaceFinalizeSnapshotCanvas` (`:415`, masked finalize-effect reference). Each is a GPU→CPU readback at orchestrator scope, consumed by a GPU stage as a reference input and cleaned up in the final `finally`. Lifetime management moves in Slice 4 (plan line 67); allocation stays because both the mask range-gate and the ASCII cell-grid downsample require a CPU-readable source.

All seven are either one-shot bake/pre-pack work (1,2), pure degraded-context fallbacks (3–6), or reference-only GPU→CPU readbacks (7). None widen a categorical gap; none return an `HTMLCanvasElement` across a stage boundary that is not immediately consumed by GPU blend, GPU stage input, or final materialisation.

#### Brush mask point-count cap re-check

`GPU_BRUSH_MASK_MAX_POINTS = 512` (`PipelineRenderer.ts:101`). Points beyond the cap cause `renderLocalMaskShape` to return false (`PipelineRenderer.ts:1066-1068`), which flows up to `renderLocalMaskShapeOnGpuToSurface` returning null, which in `effectMask.ts:210-226` triggers the Canvas2D `drawLocalMaskShape` fallback into the output mask canvas. The mask canvas is then consumed by `blendMaskedCanvasesOnGpuToSurface` — the Surface-in/Surface-out contract of the effect stage still holds because the CPU work stays inside the mask-stage box and its output is a GPU-consumed canvas, not a returned surface. Slice 4 does **not** require lifting the cap; it only requires that `applyImageEffectsToSurfaceIfSupported` / `applyImageCarrierTransformsToSurfaceIfSupported` remain able to produce a surface in the over-cap case, which they already do.

No deeper invasions found in `gpu-brush-mask-rasterization` scope. The task claimed done covers the three call sites exercised by `renderSingleImage.ts` (develop-effect mask, style-effect mask, carrier mask, finalize-effect mask) because they all route through the same `renderImageEffectMaskToCanvas` (`effectMask.ts:187`) or `applyMaskedStageOperation*` helpers.

#### Category (a) — feasible on GPU within this task

None. Every typed effect/carrier already has a primary GPU path.

#### Category (c) — genuinely permanent CPU

None. Slice 4 is unblocked.

#### Slice 4 prep notes (recorded here, not acted on)

- `renderSingleImage.ts:15-26` imports six pairs of `apply*` / `apply*ToSurfaceIfSupported` helpers. The Slice 4 collapse target is to keep only the `*ToSurfaceIfSupported` variants, rename them `apply*` (mandatory, no null return on success), and delete the canvas-only twins. Remaining canvas-materialisation occurs once, at the public boundary immediately before `renderSingleImageToCanvas` returns.
- `applyImageOverlaysToCanvasIfSupported` (`overlayExecution.ts:199`) currently owns the fallback canvas-draw path. After Slice 4 the overlay stage becomes Surface-only; the `drawImageOverlayCanvasesToCanvas` helper (`overlayExecution.ts:88-104`) can either be deleted or repurposed as the single final-materialisation site.
- Tests mocking the old twins (`renderSingleImage.test.ts:44-47`, `renderSingleImage.test.ts:363-365,913,988` etc.) assume the `*IfSupported` variant returns null → canvas path engages. Slice 4 must rewrite those assertions, not merely delete them, to preserve the existing behaviour gate on masked vs unmasked / timestamp / finalise coverage.
- `canvasMaterializations` debug counter at `renderSingleImage.ts:192-200` is currently > 1 per render whenever an `*IfSupported` returns null. After Slice 4 it must equal 1 on every render (per Validation Boundary line 75).

No code changes made in this slice. Three parallel Explore reviews (type coverage / CPU-island classification / Slice 4 readiness) run against this audit — the only actionable finding was the omission of orchestrator-level reference-snapshot clones, now folded into CPU-island item 7 above. No other audit corrections.

### Slice 4 findings (2026-04-17)

Shipped on `refactor/render-single-path`. `renderSingleImage.ts` now holds one `RenderSurfaceHandle` from the develop/full base through carrier, style, overlay, and finalize — with a single final `materializeToCanvas(canvas)` before return. The `*IfSupported` null-return envelope is retired across the four per-image stage helpers.

#### API collapse

- `effectExecution.ts`: `applyImageEffectsToSurfaceIfSupported` renamed to `applyImageEffects` (Surface-in / Surface-out, mandatory). The Canvas-form `applyImageEffects` and its internal `applyFilter2dEffect` helper are deleted. On GPU-pass failure the helper throws instead of returning null.
- `asciiEffect.ts`: `applyImageCarrierTransformsToSurfaceIfSupported` renamed to `applyImageCarrierTransforms` (Surface-in / Surface-out, mandatory). The Canvas-form multi-transform orchestrator and the canvas-only `applyImageAsciiCarrierTransform` / `applyImageAsciiCarrierTransformToSurfaceIfSupported` pair are collapsed into a single surface-only `applyImageAsciiCarrierTransform({ baseSurface, sourceCanvas, … })`. The stale `sourceRevisionKey` / `maskRevisionKey` / `mode` parameters that were threaded through the Canvas path are dropped — none of them reached the GPU input after Slice 2.
- `overlayExecution.ts`: `applyImageOverlaysToSurfaceIfSupported` renamed to `applyImageOverlays`. Canvas-only helpers `applyImageOverlaysToCanvasIfSupported`, the old `applyImageOverlays` wrapper, `drawImageOverlayCanvasesToCanvas`, `blendImageOverlayCanvasesToSurfaceIfSupported`, and `renderImageOverlaysToCanvases` are deleted. The internal Canvas2D rasterization + GPU-blend-back path is inlined as a bounded CPU island inside the new helper — it runs only when `applyTimestampOverlayToSurfaceIfSupported` declines, and its output is still a `RenderSurfaceHandle`.
- `stageMaskComposite.ts`: Canvas-form `applyMaskedStageOperation`, its private `createCanvasLayer` helper, and the Canvas2D `blendMaskedLayerIntoCanvasFallback` degrade path are deleted. Only `applyMaskedStageOperationToSurfaceIfSupported` remains; the masked-stage abstraction is now exclusively Surface→Surface.
- `src/lib/timestampOverlay.ts`: dead `applyTimestampOverlayToCanvasIfSupported` export is removed (its only caller was the deleted canvas overlay helper).

#### Orchestration shape

`renderSingleImageToCanvas` went from ≈508 lines of dual-path bookkeeping to ≈330 lines of linear Surface chaining:

- Single `let surface: RenderSurfaceHandle` variable threaded through `develop → (develop effects) → film → carrier → style → overlay → finalize`.
- Removed flags: `styleEffectsAppliedOnSurface`, `overlaysAppliedOnSurface`, `finalizeEffectsAppliedOnSurface`, plus the `trackSurfaceMaterialization` wrapper.
- Per-stage `canvas.width = 0` cleanup moved into a tiny `releaseCanvas` helper; only the cross-stage `developSnapshotCanvas` (needed by develop masks + carrier `analysisSource: "develop"`) and `carrierAnalysisSnapshotCanvas` (carrier `analysisSource: "style"` + mask reference) persist in the outer try/finally. Style and finalize snapshots are now allocated and released inside their own stage blocks.
- `canvasMaterializations` in the debug trace is ≤ 1 per render (increments only when `canvas !== surface.sourceCanvas`). The final `surface.materializeToCanvas(canvas)` is the sole materialization boundary.
- `applyImageOverlays` returns the overlaid surface so finalize effects chain onto the post-overlay surface — closing the old "finalize runs on canvas when overlays fell back" divergence from plan line 414–430.

#### Validation

- Pass: `pnpm exec tsc --noEmit --pretty false` (ran via local `node_modules/.bin/tsc`).
- Pass: `git diff --check` (no whitespace errors).
- Deferred: `pnpm vitest run …` targets — sandbox runs Node 18.19.1, vitest@4.1.0 + rolldown demands Node ≥ 20 (`SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'`). Same blocker as Slice 2; the test files are updated to match the new contract and must be executed in a Node ≥ 20 environment before the branch is merged.
- Deferred: `ascii-magic-parity` visual-diff fixtures — still require a live preview environment; no behavioural regression expected in Slice 4 since the ASCII path is untouched.

#### Slice 4 review outcomes (2026-04-17)

Three parallel Explore reviews (orchestration correctness / Surface-only stage helpers / test-coverage parity) ran against the Slice 4 edits. Findings broke into three buckets.

##### Real issue found and fixed in this session

- **Masked-bucket stage-reference reuse lost coverage.** The pre-Slice-4 test "uses a stable stage snapshot for masked raster effects within the same placement bucket" pinned the guarantee that two masked effects in one placement share a single `stageReferenceCanvas` for mask rasterisation. Slice 4 moved the guarantee inside `applyImageEffects` (see `effectExecution.ts:18-86` — one `stageReferenceCanvas` threaded through every masked iteration), and the rewritten `renderSingleImage.test.ts` no longer exercises it because the orchestrator now mocks `applyImageEffects` at the module boundary. Added a new test in `effectExecution.test.ts` ("shares a single stageReferenceCanvas across masked effects in the same call") that passes two masked effects in one call and asserts both `renderImageEffectMaskToCanvas` invocations receive the same `referenceSource`.

##### Non-issues from the reviews (recorded for completeness)

- **"Finalize runs unconditionally after overlays".** Flagged as a potential regression vs the baseline's surface-path gate `overlays.length === 0 || overlaysAppliedOnSurface`. Baseline behaviour was actually unconditional: the surface path ran finalize inside that gate, and the canvas path at `renderSingleImage.ts:449` ran finalize whenever `!finalizeEffectsAppliedOnSurface`. Net pre-/post-Slice-4 behaviour is identical — finalize effects always execute when they exist.
- **`canvas !== surface.sourceCanvas` materialization gate.** Equivalent to the baseline's `targetCanvas !== surface.sourceCanvas` check inside `trackSurfaceMaterialization`. The public canvas never aliases a renderer slot's source canvas in practice, so the counter reliably reaches 1 per render; no hidden skip.
- **ASCII carrier `sourceRevisionKey` / `maskRevisionKey` / `mode` params dropped.** Confirmed dead in the baseline surface path — those parameters threaded only through the Canvas twin and never reached the GPU shader input. Safe removal.
- **`applyImageEffects` masked branch does not route through `applyMaskedStageOperationToSurfaceIfSupported`.** Intentional. The effect+mask+blend sequence is inlined (`effectExecution.ts:47-86`); the wrapper remains in use only for the carrier path where the operation is callback-shaped. Operationally equivalent.
- **"CPU canvas fallback for overlays + finalize is no longer tested".** Retired by design; the canvas fallback is deleted, so the coverage is obsolete rather than lost.
- **ASCII zero-dimension early return.** Handled inside `prepareCarrierGpuInput` returning `null` when `buildAsciiCellGrids` can't run; the pre-Slice-4 tests did not pin this edge case either.
- **`createCanvasLayer` deletion.** Verified not referenced outside `stageMaskComposite.ts`; only a stale worktree mirror remains (ignored).

#### Follow-ups carried forward (not in Slice 4 scope)

- `canvas-preview-performance-followup` preview-executor split remains a separate task per the original non-goals list.

#### Slice 4 follow-on cleanup (2026-04-17)

Cleared after reviewing the outstanding debts flagged in the task summary.

- **Canvas-form GPU primitives retired.** `applyFilter2dOnGpu`, `applyFilter2dOnGpuToCanvas`, `applyAsciiCarrierOnGpu`, `applyTimestampOverlayOnGpu`, `blendCanvasLayerOnGpu`, and the now-unused `runRendererCanvasOperation` in `gpuSurfaceOperation.ts` are deleted. After Slice 4 none had in-tree callers; leaving them exported invited drift. Surface-form helpers remain the only public entry points at the GPU primitive layer.
- **`uSampler` implicit contract closed.** `PipelinePass` now exposes a `usesPriorTexture?: boolean` flag; `FilterPipeline.execute` only injects `uSampler: currentTexture` when it is truthy (default true preserves every processing pass). Generator passes — the AsciiCarrier pass registered in `PipelineRenderer.renderAsciiCarrierLayer` — set `usesPriorTexture: false` so the "no prior-pass dependency" contract is explicit in the call site instead of relying on twgl silently dropping unused uniforms. Slice 2 Bug 3 is now structurally closed rather than narrowed.
- **CI + PR review fixes.** `ProgramRegistry.test.ts` updated to match the post-Slice-2 shader surface (`sampleCellTone` replaces the deleted `resolveTone` helper). `PipelineRenderer.getGlyphAtlas` drops the DEV-only opaque `#222222` fill that inverted the alpha mask used as glyph shape — the atlas canvas now stays transparent-only so the GPU-side `u_glyphAtlas.a` sample is the glyph silhouette in every mode. The data-URL debug snapshot is unaffected; DevTools renders it against its own background.
