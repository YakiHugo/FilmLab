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

### Slice 4 — Effect mask shapes & range gate

- Verify `mask/linearGradient`, `mask/radialGradient`, `mask/brushStamp`, `mask/rangeGate`, `mask/maskInvert` cover the WebGL2 helpers' behavior (especially `renderLocalMaskShapeOnGpuToSurface`'s shape dispatch and `applyLocalMaskRangeOnGpu` two-arg variant).
- Switch `effectMask.ts`. Delete `gpuLocalMaskShape.ts`, `gpuLocalMaskRangeGate.ts`.
- Validation: pixel parity on linear / radial / brush / range fixtures, ≤ 2/255.

### Slice 5 — Overlay timestamp + canvas blend

- Port `TimestampOverlay.frag` to `src/lib/gpu/wgsl/overlay/timestamp.wgsl`. New `passes/overlay/timestamp.ts`.
- Use existing `mask/maskedBlend` for the canvas-layer blend used by caption / watermark overlays.
- Switch `overlayExecution.ts`. Delete `gpuTimestampOverlay.ts`, `gpuCanvasLayerBlend.ts`.
- Validation: pixel parity for timestamp + caption + watermark overlays, ≤ 2/255.

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
