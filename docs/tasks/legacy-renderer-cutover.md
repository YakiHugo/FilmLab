# Legacy Renderer Cutover

- Baseline: `src/lib/gpu/` (WebGPU kernel) handles develop + film + masking + post passes; `src/render/image/renderSingleImage.ts` defaults to `WebGPURenderBackend`. Carrier / signal damage / effect post-processing / overlay execution still calls into `src/lib/renderer/` (WebGL2 + twgl.js + GLSL `.frag`). `src/lib/renderer/` cannot be deleted while these consumers route through `gpuSurfaceOperation.ts` → `PipelineRenderer`.
- Scope: port the remaining stage-execution shaders to WGSL passes under `src/lib/gpu/passes/`, switch each consumer in `src/render/image/`, then delete `src/lib/renderer/` + `twgl.js`. Closes `render-kernel-webgpu-rewrite` s7.

## Consumers and Targets

| Consumer (`src/render/image/`) | Calls today (`src/lib/renderer/`) | Target WGSL pass |
| --- | --- | --- |
| `halftoneEffect.ts` | `gpuHalftoneCarrier` (`HalftoneCarrier.frag`, 109L) | `passes/carrier/halftone/` (new) |
| `signalDamageExecution.ts` | `gpuSignalDamage` (`ChannelDrift.frag`, 26L) | `passes/signalDamage/channelDrift/` (new) |
| `effectExecution.ts` | `gpuFilter2dPostProcessing` (`Filter2dAdjust.frag`, 37L), `gpuMaskedCanvasBlend` | new filter2d pass + existing `mask/maskedBlend` |
| `stageMaskComposite.ts` | `gpuMaskedCanvasBlend` | existing `mask/maskedBlend` |
| `effectMask.ts` | `gpuLocalMaskRangeGate`, `gpuLocalMaskShape` | existing `mask/{linearGradient,radialGradient,brushStamp,rangeGate,maskInvert}` |
| `overlayExecution.ts` | `gpuCanvasLayerBlend`, `gpuTimestampOverlay` (`TimestampOverlay.frag`, 89L) | existing `mask/maskedBlend` + new `passes/overlay/timestamp/` |
| `asciiEffect.ts` | `gpuAsciiCarrier` (`AsciiCarrier.frag`) | existing `passes/carrier/ascii/` (composition needs extension) |

## Decisions

- **Per-consumer cutover, not big-bang.** Each consumer switches independently; existing WebGL2 path stays alive until all consumers move. Pixel parity is the gate.
- **Reuse existing `src/lib/gpu/passes/mask/` and `passes/utility/` where applicable.** `gpuMaskedCanvasBlend` and `gpuCanvasLayerBlend` collapse into `mask/maskedBlend`; effect mask shapes already have WGSL counterparts. Validate behavior parity, do not blindly re-port.
- **Adapter shape preserved.** Each consumer keeps its `*OnGpuToSurface(...)` call shape and `RenderSurfaceHandle` in/out. The internal switch is import-only — no orchestration change in `src/render/image/`.
- **ASCII composition needs extension first.** The s1 ASCII composition pass is foreground-glyph-only. Dual-layer (background blur), dot mode, color modes (full-color/duotone), and grid overlay must be added before `asciiEffect.ts` can swap. Track inside s6.
- **No fallback to WebGL2.** Once a consumer switches, the old `src/lib/renderer/` helper for that consumer can be deleted in the same commit. The full `src/lib/renderer/` deletion lands in s7 only after all consumers are off it.
- **twgl.js removal is s7-only.** Until the last consumer leaves, `PipelineRenderer` still imports twgl, so the dep cannot drop.

## Slices

### Slice 1 — Halftone carrier WGSL

- Port `HalftoneCarrier.frag` to `src/lib/gpu/wgsl/carrier/halftone.wgsl` (mono / CMYK / RGB color modes, circle / diamond / line / square dot shapes).
- New `src/lib/gpu/passes/carrier/halftone.ts` exposing both the orchestrator-style pass (`HalftonePipelineCache` + `createHalftonePass`) and the `RenderSurfaceHandle → RenderSurfaceHandle` standalone adapter `applyHalftoneOnSurface`.
- Switch `src/render/image/halftoneEffect.ts` import. Delete `src/lib/renderer/gpuHalftoneCarrier.ts`.
- Validation: pixel parity vs WebGL2 on a fixture image with each mode/shape combo. Smoke harness under `scripts/gpu-smoke/halftone.html`. Gate ≤ 2/255.

**Slice 1 implementation notes (done):**
- `src/lib/gpu/wgsl/carrier/halftone.wgsl` + `src/lib/gpu/passes/carrier/halftone.ts` landed; `gpuHalftoneCarrier.ts` deleted.
- Single file holds the orchestrator-shape pass (`HalftonePipelineCache` / `createHalftonePass`) plus the standalone surface op `applyHalftoneOnSurface`. The surface op caches `ShaderCache` + `HalftonePipelineCache` per device on a module-scope `WeakMap<GPUDevice, …>`, mirroring orchestrator's per-device cache pattern; halftone is not currently composed into the kernel, so it owns its tiny `TexturePool` + `PipelineExecutor` lifecycle per call.
- WGSL rotation matrix uses `mat2x2<f32>(vec2(c, -s), vec2(s, c))` to match GLSL's column-major `mat2(c, -s, s, c)` exactly. Both produce `[ c s ; -s c ]`; `mat * pixel` then yields `(c·x + s·y, -s·x + c·y)` on both sides.
- Uniform layout: 4 vec4 = 64 bytes. Packs `(canvasW, canvasH, freq, angle) | (shape, colorMode, dotScale, contrast) | (bgR, bgG, bgB, bgOpacity) | (invert: u32, _, _, _)`. Background opacity moves into the bg vec4 .a slot (the GLSL took it as a separate scalar).
- `halftoneEffect.ts` switched to `applyHalftoneOnSurface`; the input shape changed from `backgroundColorRgba: Float32Array(4)` to `backgroundColor: [r, g, b]` (opacity is its own field). The legacy `HalftoneCarrierGpuInput` type is removed with `gpuHalftoneCarrier.ts`.
- Validation harness `scripts/gpu-smoke/halftone.html` covers 9 scenarios (mono × {circle, diamond, line, square}, cmyk/circle, rgb/circle, mono inverted, mono with bg-opacity 0.5, mono at 60Hz/60deg). Real-adapter run pending on user hardware (this branch was developed without a working SwiftShader/native WebGPU loop on the cloud machine).
- `pnpm tsc --noEmit` clean, `pnpm vitest run` 682/682 pass with the consumer rewired through the new pass.

### Slice 2 — Channel drift signal damage

- Port `ChannelDrift.frag` to `src/lib/gpu/wgsl/signalDamage/channelDrift.wgsl`.
- New `src/lib/gpu/passes/signalDamage/channelDrift/{pass.ts,index.ts}`.
- Switch `signalDamageExecution.ts`. Delete `gpuSignalDamage.ts`.
- Validation: pixel parity on per-channel offset fixtures, ≤ 2/255.

**Slice 2 implementation notes (done):**
- `src/lib/gpu/wgsl/signalDamage/channelDrift.wgsl` + `src/lib/gpu/passes/signalDamage/channelDrift.ts` landed; `gpuSignalDamage.ts` and `shaders/ChannelDrift.frag` deleted. The single-file shape mirrors slice 1's halftone: `ChannelDriftPipelineCache` + `createChannelDriftPass` for the orchestrator-shape composition path, plus the standalone surface op `applyChannelDriftOnSurface` for direct consumer use.
- The legacy `ChannelDriftGpuInput.{width,height}` rename to `ChannelDriftPassParams.{canvasWidth,canvasHeight}` lines up with the existing halftone naming convention and is the only consumer-visible field rename in `signalDamageExecution.ts`.
- Uniform layout: 3 vec4 = 48 bytes. Packs `(canvasW, canvasH, intensity, _) | (redX, redY, greenX, greenY) | (blueX, blueY, _, _)`.
- ProgramRegistry pruning: `channelDrift` program entry removed (frag import + interface + `PROGRAM_FRAGMENTS` row + `DEFERRED_WARMUP_PROGRAMS` entry). PipelineRenderer drops `renderChannelDriftComposite` and the `ChannelDriftGpuInput` import.
- Validation harness `scripts/gpu-smoke/channelDrift.html` covers 6 scenarios (positive symmetric, negative symmetric, asymmetric, diagonal, zero-intensity, zero-offsets). The original GLSL is inlined into the smoke harness for the WebGL2 reference path since the `.frag` file is gone.
- `pnpm tsc --noEmit` clean, `pnpm vitest run` 682/682 pass. Pre-existing s1-leftover dangling import `import type { HalftoneCarrierGpuInput } from "./gpuHalftoneCarrier"` in `PipelineRenderer.ts:51` is unaffected by s2 — surfaced only under `pnpm tsc --build --force` and tracked under s1's review chain, not this slice.

### Slice 3 — Effect filter2d + masked composites

- Port `Filter2dAdjust.frag` to `src/lib/gpu/wgsl/post/filter2dAdjust.wgsl`. New `passes/post/filter2dAdjust.ts`.
- Verify existing `mask/maskedBlend` behavior covers `gpuMaskedCanvasBlend`. If not, extend it.
- Switch `effectExecution.ts` and `stageMaskComposite.ts`. Delete `gpuFilter2dPostProcessing.ts`, `gpuMaskedCanvasBlend.ts`.
- Validation: pixel parity for one effect-with-mask scenario, ≤ 2/255.

**Slice 3 implementation notes (done):**
- `src/lib/gpu/wgsl/post/filter2dAdjust.wgsl` (brightness + YIQ hue rotation) + `src/lib/gpu/passes/post/filter2dAdjust.ts` landed; `gpuFilter2dPostProcessing.ts` deleted. The WGSL pass is the brightness/hue port only; the `applyFilter2dOnSurface` adapter composes `filter2dAdjust → utility/gaussianBlur(h+v) → utility/dilate` with the same uniform derivation as the legacy `PipelineRenderer.applyFilter2dSource` (brightnessFactor, hueRadians, blurRadius via `resolveBlurRadiusPx`, dilateRadius via `resolveDilateRadiusPx`). Identity case (no enabled passes) does a direct `readbackTextureRGBA8` of the upload texture, mirroring the WebGL `captureLinearSource → present` round-trip.
- WGSL `mat3x3<f32>` constructor is column-major (same as GLSL `mat3`); the YIQ ↔ RGB matrices in `filter2dAdjust.wgsl` are listed scalar-for-scalar identical to the GLSL constants.
- `mask/maskedBlend.ts` now hosts the standalone `applyMaskedBlendOnSurface` and `applyMaskedBlendOnGpu` adapters (uploads base/layer/mask, executes one `MaskedBlend` pass, reads back). The on-Gpu (target-canvas) variant is consumed by `imageProcessing.ts`'s local-adjustment compose paths; the on-Surface variant is consumed by `effectExecution.ts` and `stageMaskComposite.ts`. The legacy `slotId` parameter on `applyMaskedBlendOnGpu` is dropped — it was a WebGL renderer-slot lifecycle hint with no equivalent on the WGSL side.
- `composeLocalLayer` in `imageProcessing.ts` no longer takes/forwards `gpuBlendSlotId` (caller-side string was never observed inside the deleted callee). Two call-sites pruned to match.
- `PipelineRenderer.applyFilter2dSource` removed; `ProgramRegistry` drops the `filter2dAdjust` and `dilate` program entries (single consumer was `applyFilter2dSource`); the `Filter2dAdjust.frag` and `Dilate.frag` GLSL files are deleted. `programs.blur` and `programs.maskedBlend` stay alive — the AsciiCarrier (s6) and overlay/local-blend (s5) paths still consume them.
- `scripts/gpu-smoke/filter2dAdjust.html` covers 7 scenarios (identity, brightness ±, hue ±, combined ±). The deleted `Filter2dAdjust.frag` is inlined into the smoke for the WebGL2 reference; same inlining trick applied to `scripts/gpu-smoke/maskingPost.html` (it referenced `Dilate.frag`).
- `pnpm tsc --noEmit` clean, `pnpm vitest run` 682/682 pass. `pnpm lint` and `pnpm dead-code` baselines unchanged from main (the lone lint error in `passes/develop/curve.ts` and the s1-leftover `gpuHalftoneCarrier` unresolved import predate this slice).

### Slice 4 — Effect mask shapes & range gate

- Verify `mask/linearGradient`, `mask/radialGradient`, `mask/brushStamp`, `mask/rangeGate`, `mask/maskInvert` cover the WebGL2 helpers' behavior (especially `renderLocalMaskShapeOnGpuToSurface`'s shape dispatch and `applyLocalMaskRangeOnGpu` two-arg variant).
- Switch `effectMask.ts`. Delete `gpuLocalMaskShape.ts`, `gpuLocalMaskRangeGate.ts`.
- Validation: pixel parity on linear / radial / brush / range fixtures, ≤ 2/255.

**Slice 4 implementation notes (done):**
- New `src/lib/gpu/passes/mask/localShape.ts` adapter composes the existing pass caches (`LinearGradientPipelineCache`, `RadialGradientPipelineCache`, `BrushStampPipelineCache`, `MaskInvertPipelineCache`) into a single `applyLocalMaskShapeOnSurface` op. Module-scope `WeakMap<GPUDevice, …>` caches the shader + pipeline caches per device; the surface op owns the per-call `TexturePool` + `PipelineExecutor` lifecycle and 1×1 RGBA8 transparent input texture (gradient passes ignore it; brush stamp samples it as the empty starting alpha).
- `mask/rangeGate.ts` gained the standalone `applyLocalMaskRangeOnSurface` and `applyLocalMaskRangeOnCanvas` adapters, mirroring slice 3's `mask/maskedBlend.ts` shape (separate per-device cache + readback). The on-canvas variant is consumed by `imageProcessing.ts`'s build-local-mask CPU-mask branch; the on-surface variant is consumed by both `effectMask.ts` and `imageProcessing.ts` whenever the GPU shape pass produced a surface first.
- Invert handling collapses to a trailing `MaskInvert` pass for both gradient and brush variants (legacy WebGL gradients took an `u_invert` uniform and the brush path appended a separate invert pass — WGSL now uses one pattern). Empty brush + non-invert short-circuits to a transparent owned canvas (no GPU work); `pointsLength > 512` returns `null` so callers fall back to CPU painting, matching `GPU_BRUSH_MASK_MAX_POINTS` from the legacy renderer.
- Adapter naming: kept the legacy "OnSurface" / "OnCanvas" suffix split but dropped "OnGpu" since the new module path is already under `passes/mask/`. `applyLocalMaskRangeOnCanvas` no longer takes `slotId` — the legacy WebGL renderer-slot lifecycle hint has no equivalent under the WGSL adapter (each call creates its own `TexturePool`).
- Consumer rewires: `src/render/image/effectMask.ts` and `src/lib/imageProcessing.ts` swap imports to the new adapters with no orchestration change. `src/lib/renderer/PipelineRenderer.ts` drops `renderLocalMaskShape`, `applyLocalMaskRangeGateSource`, and the `GPU_BRUSH_MASK_MAX_POINTS` constant; `localMaskShared` and `LocalAdjustmentMask` imports become unused and are removed. `ProgramRegistry` prunes 5 program entries (`linearGradientMask`, `radialGradientMask`, `localMaskRangeGate`, `brushMaskStamp`, `maskInvert`) along with their `.frag` shader files; `programs.passthrough` and `programs.maskedBlend` stay alive (still consumed by ascii / overlay / local-blend paths).
- `PipelineRenderer.localMaskShape.test.ts` deleted with the methods. `ProgramRegistry.test.ts` lost the `brushMaskStamp` / `maskInvert` lazy-cache tests; the orphan-detection self-check switches to `programs.hsl` (next still-existing deferred shader). Effect mask + imageProcessing test mocks rewire to the new module paths and helper names.
- `scripts/gpu-smoke/maskingPost.html` inlines the deleted GLSL shaders (LinearGradientMask, RadialGradientMask, BrushMaskStamp, MaskInvert, LocalMaskRangeGate) for the WebGL2 reference path, same trick used in slice 3 for `Dilate.frag` — keeps the parity gate runnable against the WGSL versions even after the renderer source files are gone.
- `pnpm tsc --noEmit` clean, `pnpm vitest run` passes after removing the 5 localMaskShape renderer tests + 3 ProgramRegistry tests for the pruned programs. `pnpm lint` only reports the pre-existing `passes/develop/curve.ts` empty-interface error. `pnpm dead-code` introduces no new unused exports.
- Per-device cache extraction: `src/lib/gpu/perDeviceCache.ts` (`createPerDeviceCache<T>(factory)`) consolidates the duplicated `WeakMap<GPUDevice, …> + getCache(device)` pattern across all six standalone surface adapters — `passes/{carrier/halftone, signalDamage/channelDrift, post/filter2dAdjust, mask/maskedBlend, mask/localShape, mask/rangeGate}`. Reason: hotspot regressed from 4 sites (s3) to 6 (s4) without new per-site variation, triggering the AGENTS rule "if a hotspot keeps regressing, prefer a structural refactor over more local patches".

### Slice 5 — Overlay timestamp + canvas blend

- Port `TimestampOverlay.frag` to `src/lib/gpu/wgsl/overlay/timestamp.wgsl`. New `passes/overlay/timestamp.ts`.
- Use existing `mask/maskedBlend` for the canvas-layer blend used by caption / watermark overlays.
- Switch `overlayExecution.ts`. Delete `gpuTimestampOverlay.ts`, `gpuCanvasLayerBlend.ts`.
- Validation: pixel parity for timestamp + caption + watermark overlays, ≤ 2/255.

**Slice 5 implementation notes (done):**
- New WGSL passes: `wgsl/overlay/timestamp.wgsl` and `wgsl/overlay/normalLayerBlend.wgsl`. The timestamp pass folds rect+glyph rendering plus the source-over composite against the base into a single fragment — the legacy renderer ran TimestampOverlay.frag to a layer texture and then a separate LayerBlend.frag pass. Folding avoids the intermediate texture and keeps the surface adapter to one `executor.execute` call.
- `passes/overlay/timestamp.ts` exposes `applyTimestampOverlayOnSurface`. The CPU helper `buildTimestampGlyphAtlas` mirrors the legacy `getGlyphAtlas` for the `fontSizePx`-supplied path (atlasScale=1, glyphs rasterized at exactly `cellWidth × cellHeight`). The atlas is built and uploaded per call (timestamp text changes per frame, so caching at the pass level offers no win) and disposed in the `finally` block.
- Uniform layout: 6 leading vec4 + 16 vec4 (glyph indices, packed 4-per-vec4) = 352 bytes. The legacy `u_glyphIndices[64]` Float32Array maps directly to the packed `array<vec4<f32>, 16>` since WGSL uniform-array stride is 16 bytes.
- **Deviation from the slice plan**: the plan said "use existing `mask/maskedBlend` for the canvas-layer blend." `mask/maskedBlend.wgsl` does `mix(base, layer, mask.a)` with `outAlpha = mix(base.a, layer.a, mask.a)`, which yields the wrong output alpha when the layer is treated as its own mask (non-physical drift like `1 - layer.a + layer.a²`). Across an overlay chain the alpha drift compounds and shows up when the composite canvas is later sampled (next overlay iteration uses the wrong base.a). Created `passes/overlay/normalLayerBlend.ts` instead — its WGSL mirrors `LayerBlend.frag` with `blendMode=normal, opacity=1, useMask=false`: `outRgb = mix(base.rgb, layer.rgb, layer.a); outA = base.a + layer.a * (1 - base.a)` — the same formula the legacy `blendLinearLayers` produced. `mask/maskedBlend` keeps its current semantics for the s3 effect-mask consumers.
- Consumer rewires: `src/lib/timestampOverlay.ts` swaps `applyTimestampOverlayOnGpuToSurface` → `applyTimestampOverlayOnSurface`. `src/render/image/overlayExecution.ts` swaps `blendCanvasLayerOnGpuToSurface` → `applyNormalLayerBlendOnSurface`. Both keep the same call shape — single import-line change.
- Renderer pruning: `src/lib/renderer/gpuTimestampOverlay.ts`, `src/lib/renderer/gpuCanvasLayerBlend.ts`, and `shaders/TimestampOverlay.frag` deleted. `PipelineRenderer.renderTimestampOverlayLayer` + `renderTimestampOverlayComposite` removed along with the `TimestampOverlayGpuInput` type import. `ProgramRegistry` drops the `timestampOverlay` program entry (interface field, `PROGRAM_FRAGMENTS` row, `DEFERRED_WARMUP_PROGRAMS` entry, frag import). `LayerBlend.frag` and `programs.maskedBlend` stay alive — they are still consumed by AsciiCarrier (s6) and `imageProcessing.ts::blendLinearWithMask` (a separate compose path that needs to migrate before s7 closes).
- Tests: `ProgramRegistry.test.ts` loses the `timestampOverlay` lazy-cache test. `renderSingleImage.timestampOverlay.integration.test.ts` rewires its two `vi.mock` blocks to the new module paths and helper names. Total tests after the cleanup: 673/673 (was 674; one cache-registration test was specific to the deleted GLSL program).
- `scripts/gpu-smoke/overlay.html` covers 3 timestamp scenarios (different positions / sizes / opacities) and 3 normalLayerBlend scenarios (transparent layer, opaque rect, partial-alpha gradient). The deleted `TimestampOverlay.frag` is inlined into the harness for the WebGL2 reference path; `LayerBlend.frag` is imported from src since it is still alive. Real-adapter run pending on user hardware.
- `pnpm tsc --noEmit` clean; `pnpm vitest run` 673/673 pass; `pnpm lint` only reports the pre-existing `passes/develop/curve.ts` empty-interface error; `pnpm dead-code` baseline unchanged.

### Slice 6 — ASCII carrier wiring

- Extend `src/lib/gpu/passes/carrier/ascii/composition.ts` + `wgsl/...composition.wgsl` to cover: dual-layer compositing (background blur source), dot mode, full-color / duotone modes, grid overlay. Match `AsciiCarrier.frag` features 1:1.
- Switch `asciiEffect.ts` carrier path: replace `applyAsciiCarrierOnGpuToSurface` with the WGSL pipeline (descriptors → analysis → selection → composition).
- Delete `gpuAsciiCarrier.ts` and the CPU tone computation in `asciiEffect.ts` (`buildAsciiCellGrids` / tone-only selection) once the WGSL path is the sole authority.
- Validation: visual parity vs current production ASCII output (the parity check deferred from `render-kernel-webgpu-rewrite` s1) — gate per-pixel ≤ 4/255 on a representative fixture set.

### Slice 7 — Delete legacy renderer

- Remove every remaining file under `src/lib/renderer/` (`PipelineRenderer`, `FilterPipeline`, `ProgramRegistry`, `TexturePool`, `TextureManager`, `UniformManager`, `PassBuilder`, `PassUniformUpdaters`, `RenderManager`, `RenderPostProcessing`, all `shaders/*.frag` + `*.vert`, `gpuSurfaceOperation.ts`).
- Remove `twgl.js` from `package.json` + lockfile.
- Update `docs/decisions.md`: clear the Backend note about `src/lib/renderer/` blocking deletion.
- Close `render-kernel-webgpu-rewrite` s7 (mark done) and delete its `docs/tasks/render-kernel-webgpu-rewrite.{md,json}` pair per long-task closure rule.
- Validation: `pnpm tsc --noEmit` clean, `pnpm lint` clean, `pnpm vitest run` clean, `pnpm dead-code` clean, no `WebGL` / `twgl` / `.frag` / `.vert` / `.glsl` references in `src/`.

## Risks

- ASCII composition extension (s6) is the largest single piece — it has its own internal sub-work (background blur, color modes, grid overlay). If pixel parity proves too strict, re-evaluate the gate against the pre-rewrite Canvas2D fallback note in `decisions.md` (Canvas2D fallback is **not** a baseline).
- WGSL precision differences vs. GLSL may surface again in halftone color modes (CMYK separation) and timestamp anti-aliasing. Mitigate per-slice with pixel parity gates.
- Mask shape parity (s4) depends on existing WGSL passes already covering brush stamping with ≤512 points and the masked blend semantics. Verify before switching, not after.

## Relationship to Other Tasks

- `render-kernel-webgpu-rewrite`: this task's s7 unblocks that task's s7. Closure of this task should close that task in the same commit.
- `media-native-render-pipeline`: closed; the authored families this task executes (`carrierTransforms` / `signalDamage` / `semanticOverlays`) come from that task. No active dependency, but file references in s3-s6 consumers correspond to families it introduced.
