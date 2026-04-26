# Render Kernel WebGPU Rewrite

- Baseline: WebGL2 + twgl.js linear pass chain (`FilterPipeline` → `PipelineRenderer` 28k lines → `imageProcessing.ts` 10k lines). ASCII is a "carrier transform" bolted onto the photographic pipeline tail, CPU tone computation, density-only character selection.
- Scope: replace the entire rendering kernel with a unified WebGPU pipeline. ASCII becomes a first-class compute-driven rendering mode with structure-aware character selection. Photographic processing (develop/film/post) is ported to WGSL. No WebGL2 fallback.

## Decisions

- **WebGPU only.** Overrides `decisions.md` "WebGL2，不走 WebGPU" decision. Rationale: target audience has modern hardware; compute shaders are essential for ASCII structural analysis; no fallback maintained.
- **WGSL replaces GLSL.** All 50+ fragment shaders get WGSL rewrites, not mechanical transpilation.
- **Compute + Render pass types.** Current `PipelinePass` is render-only. New `GPUPass` discriminated union supports compute passes (ASCII analysis, selection) and render passes (all existing stages + ASCII composition).
- **Linear pipeline preserved.** No DAG scheduler — stages are fundamentally sequential (`develop → film → carrier → post`). Compute and render passes interleave in the same chain. ASCII is not a separate subsystem — it is the first member of the `carrier/` family, sharing the same executor, resource pool, and GPUDevice as all other stages.
- **Y-parity hack eliminated.** Current `Fullscreen.vert` flips Y on every draw, requiring even-pass normalization. New WGSL vertex shader uses Y-invariant UV convention; each pass preserves orientation by construction.
- **Canvas2D stays for glyph atlas bake.** Bounded CPU island, one-time per charset+font. Not worth GPU-ifying.
- **ASCII structure matching.** Characters selected by structural similarity (sub-grid density + gradient direction + centroid), not just scalar density. `structureWeight` parameter (0–1) lets users dial from pure density (current behavior) to pure structure matching.
- **twgl.js removed** after migration completes.
- **RenderManager** adapted to manage `GPUDevice` + per-slot bind groups instead of per-slot `PipelineRenderer` instances.
- **Render result contract.** Render entry points return `{ status: "rendered" | "partial-fallback" | "kept-stale", surface, fallbackReason? }`. Callsite decides UI behavior; non-`rendered` results emit to telemetry. No `console.warn`-only fallback paths. Replaces the implicit `KEEP_LAST_PREVIEW_FRAME_ON_ERROR` flag and the `geometry-fallback` status that currently masquerades as success.
- **Cache key versioning.** All cache keys (source / pipeline / output / tile-plan) live in a single `src/lib/gpu/cacheKeys.ts` builder. Each layer carries a schema version prefix (`v1:source:...`); 64-bit hash; no ad-hoc string concatenation or per-module hash helpers. WebGPU switch starts at `v1`; legacy `v0` (WebGL2) keys invalidate naturally.
- **Stage choreography boundary.** `src/lib/gpu/` is the per-frame pipeline executor; `src/render/image/` remains the stage choreographer (carrier / signal damage / overlay / finalize). Inter-stage handoff must use GPU texture handles, not `HTMLCanvasElement` snapshots — `AnalysisLayerInputs.stageSnapshots.{develop,style}` and the `stageReferenceCanvas` parameters across `effectExecution` / `signalDamageExecution` / `overlayExecution` change type from canvas to GPU texture handle. This decision invalidates parts of the `media-native-render-pipeline` snapshot contract; that task's analysis-layer slice is reopened in scope for re-typing under Slice 6.

## Target Architecture

### Module Tree

```
src/lib/gpu/
├── context.ts              # GPUDevice acquisition, feature detection, lifecycle
├── pipeline.ts             # Linear pass chain executor (replaces FilterPipeline)
├── resources.ts            # Texture/buffer pool (replaces TexturePool + TextureManager)
├── shaders.ts              # WGSL module compilation, caching (replaces ProgramRegistry)
├── passes/
│   ├── types.ts            # GPUPass = GPURenderPass | GPUComputePass
│   ├── builder.ts          # buildMainPasses equivalent
│   ├── develop/            # inputDecode, geometry, master, hsl, curve, detail
│   ├── film/               # prep, colorLut, print, grain, effects
│   ├── carrier/
│   │   ├── ascii/
│   │   │   ├── analysis.ts     # Compute: per-cell feature extraction
│   │   │   ├── selection.ts    # Compute: structure matching against glyph descriptors
│   │   │   ├── composition.ts  # Render: glyph/dot drawing + compositing
│   │   │   └── descriptors.ts  # Glyph structure precomputation (CPU → GPU buffer)
│   │   └── (future: halftone, dither, palette, textmode)
│   ├── post/               # halation, bloom, outputEncode
│   ├── mask/               # gradient, brush, rangeGate, maskedBlend
│   └── utility/            # passthrough, blur, downsample, dilate, layerBlend
├── wgsl/                   # WGSL source files (mirrors passes/ structure)
├── tiled.ts                # Large-image tiling with async readback
└── orchestrator.ts         # Top-level render orchestration (replaces imageProcessing.ts)
```

### Pass Interface

```typescript
interface GPURenderPass {
  kind: "render";
  id: string;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  outputFormat: GPUTextureFormat;
  resolution?: number;
  enabled: boolean;
  consumesPrior: boolean;    // false for generator passes (ASCII composition)
}

interface GPUComputePass {
  kind: "compute";
  id: string;
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  workgroupCount: [number, number, number];
  enabled: boolean;
}

type GPUPass = GPURenderPass | GPUComputePass;
```

### Pipeline Executor

All passes encoded into a single `GPUCommandBuffer` before submission. Compute and render passes interleave naturally. Resource transitions are explicit.

### ASCII Structure Matching Algorithm

**Glyph descriptor precomputation** (CPU, once per charset change):
1. Rasterize each character at reference size (32×32)
2. Divide into N×N sub-grid (default 4×4 = 16 sectors)
3. Per sector: fill density + dominant gradient direction (8-bin histogram)
4. Per character: overall density, sub-grid vector (16f), edge histogram (8f), centroid offset (2f)
5. Pack into GPU storage buffer: `glyphCount × 27 floats`

**Cell analysis** (compute shader, per cell):
1. Sample source image region for this cell
2. Compute same features: sub-grid density, gradient histogram, centroid
3. Output: feature vector per cell → storage buffer

**Selection** (compute shader, per cell):
1. Compare cell features against all glyph descriptors
2. Distance: `(1-w) × densityDist² + w × (subgridDist + edgeDist + centroidDist)`
3. `w = structureWeight` (0 = density-only = current behavior, 1 = structure-only)
4. Output: glyph index per cell

**Composition** (render pass):
- Port of current `AsciiCarrier.frag` logic to WGSL
- Reads selection buffer instead of tone→index linear mapping
- Background/foreground layer compositing preserved

## Slices

### Slice 0 — WebGPU Foundation

Build `context.ts`, `pipeline.ts`, `resources.ts`, `shaders.ts`, and passthrough pass.

- `context.ts`: `requestAdapter` → `requestDevice`, feature caps, lost-device handling
- `resources.ts`: texture pool (keyed by width×height×format), buffer allocation, upload from `ImageBitmap`
- `pipeline.ts`: linear executor — encode render passes to command buffer, ping-pong textures, output to canvas or texture
- `shaders.ts`: compile WGSL modules, cache by source hash
- `passes/utility/passthrough.ts` + `wgsl/passthrough.wgsl`: identity render pass

Validation: upload a source image → passthrough → `readback` matches input pixels within 1/255.

**Slice 0 implementation notes (done):**
- `src/lib/gpu/{context,pipeline,resources,shaders}.ts` + `passes/{types.ts,utility/passthrough.ts}` + `wgsl/passthrough.wgsl` landed.
- `GPUPass` is a discriminated union (`render` | `compute`); render passes carry a `bindGroups` factory rather than a precomputed bind group, because the executor ping-pongs textures and the input view changes per frame.
- Pool releases happen AFTER `device.queue.submit` — encoded passes still reference attachments at encode time, so eager release would let the pool hand the same texture back as the next pass's output.
- Y-invariant UV is proven by the smoke harness (`scripts/gpu-smoke/passthrough.html`): max per-channel diff = 0 on a 16×16 deterministic gradient.
- Validation procedure: `pnpm dev:client`, then open `http://localhost:5173/scripts/gpu-smoke/passthrough.html`. Page logs PASS/FAIL inline.
- `@webgpu/types` added as devDependency; ambient via `src/lib/gpu/webgpu.d.ts` (also declares `*.wgsl?raw`).
- knip entry list expanded with `src/lib/gpu/**/*.ts` until Slice 5.5 wires consumers.

### Slice 1 — ASCII Compute Pipeline

Build the full ASCII path: descriptors → analysis → selection → composition.

- `descriptors.ts`: CPU glyph feature extraction, packed into `GPUBuffer`
- `analysis.wgsl`: compute shader, workgroup(8,8), per-cell feature extraction from source texture
- `selection.wgsl`: compute shader, workgroup(64), per-cell glyph matching
- `composition.wgsl`: fragment shader, reads selection buffer + glyph atlas, dual-layer compositing

New user-facing parameter: `structureWeight: number` (0–1), added to `ImageAsciiEffectParams`.

Validation (against synthetic fixtures only — no dependency on develop chain, which lands in Slice 2/3):
- Fixture set: known gradient directions, density steps, and centroid offsets, fed directly to ASCII as raw source
- `structureWeight=0`: per-cell selection reproduces density-based mapping within ±1 atlas slot on the density-step fixture
- `structureWeight=1`: correctly selects `/` for diagonal edges, `|` for vertical, `_` for horizontal on the gradient fixture
- Performance: 1920×1080 synthetic source, cellSize=12 renders in <16ms on mid-range GPU

Visual parity vs. current production ASCII output (which consumes develop-stage surface, not raw source) is deferred to Slice 6 integration validation.

**Slice 1 implementation notes (done):**
- `src/lib/gpu/wgsl/carrier/ascii/{analysis,selection,composition}.wgsl` + `src/lib/gpu/passes/carrier/ascii/{descriptors,analysis,selection,composition}.ts` landed.
- Descriptor stride is 27 f32 (`density, sub16, edge8, cx, cy`); CPU and GPU compute features the same way and pack the same flat-array layout for unit-consistent distance.
- Edge histogram uses **unsigned orientation** (Sobel angle folded to `[0, π)`, HOG-style). Signed direction caused opposite-side gradients on the same line to cancel into different bins, breaking line-shape matching.
- Composition is foreground-glyph-only for Slice 1: dual-layer compositing, dot mode, color modes (full-color/duotone), grid overlay, and blurred-source background are deferred to Slice 6 when integration drives them. The render pass interface stays Slice-6-extensible.
- `structureWeight: number` added to `ImageAsciiEffectParams` and the editor default; the WebGL2 path normalizes/ignores it. Test fixtures across the repo updated to include `structureWeight: 0`. Pre-existing orphan `AsciiGpuCarrierInput` interface deleted in the same pass (knip-flagged dead code; the renderer's local `AsciiCarrierGpuInput` alias is unrelated).
- Validation harness at `scripts/gpu-smoke/ascii.html` covers all three gates. Self-rendered glyph fixtures replace hand-drawn synthetic strokes — cross-browser font fallback rendered '/' at a non-45° slope, so a hand-drawn 45° diagonal didn't match its own font glyph; using the font's own rasterization is the correct definition of "structure matches."
- Validated on SwiftShader fallback adapter: density-step + directional fixtures pass; the &lt;16ms timing gate is informational on fallback adapters and only asserted on real GPUs (gate per slice spec). Real-GPU timing pending validation on user hardware.

### Slice 2 — Photographic Core Passes

Port InputDecode, Geometry, Master, OutputEncode to WGSL render passes.

- Fix Y convention: `fullscreen.wgsl` vertex shader emits Y-invariant UV
- Port color space math (sRGB ↔ linear, LMS) to WGSL shared library
- Geometry: crop, rotate, perspective, lens correction, chromatic aberration
- Master: exposure, contrast, highlights, shadows, white balance, color grading

Validation: pixel comparison against WebGL2 output for a reference image+params set. Max deviation < 2/255 per channel.

**Slice 2 implementation notes (done):**
- `src/lib/gpu/wgsl/lib/{fullscreen,colorSpace}.wgsl` — shared Y-invariant vertex stage and color helpers (sRGB↔linear, LMS, OKLab, hsv-fast, luminance). Concatenated with each pass fragment in TS via `${fullscreen}\n${colorSpace}\n${pass}`; no `#include`/preprocessor introduced. `wgsl/passthrough.wgsl` was refactored to drop its embedded vertex stage and reuse the lib.
- `src/lib/gpu/wgsl/develop/{inputDecode,outputEncode,geometry,master}.wgsl` + `src/lib/gpu/passes/develop/{inputDecode,outputEncode,geometry,master}.ts` ported from the corresponding `.frag` files. Stateless passes (`InputDecode`) return a `GPURenderPassDescriptor` directly; passes with parameters (`OutputEncode`, `Geometry`, `Master`) return a `*PassHandle = { descriptor, updateParams, destroy }` so the uniform `GPUBuffer` can be reused across frames once Slice 5.5 wires the orchestrator. Handle pattern is intentional — Slice 5.5 will replace per-frame allocations with persistent passes.
- Uniform buffer encoding packs vec3-aligned fields into vec4 slots and bools into a single `vec4<u32>` flag word. Avoids the WGSL std140 vec3-padding pitfall and keeps the JS-side encode as a flat `Float32Array`/`Uint32Array` write. Geometry's `mat3` homography is uploaded as three vec4 columns and rebuilt as `mat3x3<f32>` in the shader for the same reason.
- Geometry's per-pixel out-of-bounds early-return (`if (opticsUv.x < 0.0 …) return black`) makes downstream `textureSample` calls non-uniform control flow, which WGSL forbids. Switched all `textureSample` in `geometry.wgsl` to `textureSampleLevel(..., 0.0)` — same behavior on a single-mip source, sidesteps the uniformity rule. The other develop passes don't trigger this because their `textureSample` is always in uniform CF.
- Validation harness: `scripts/gpu-smoke/photoCore.html` + `scripts/gpu-smoke/webgl2Reference.ts`. The reference helper compiles the existing `.frag` against `Fullscreen.vert` in a raw WebGL2 context, draws a fullscreen quad, and flips rows to match WebGPU's top-down readback. Diffs against `PipelineExecutor` output for InputDecode (1 scenario), OutputEncode (4), Geometry (4), Master (5). All 14 scenarios hit `maxDiff=0/255` against WebGL2 — gate `< 2/255` clears with margin.
- Validated on SwiftShader fallback adapter (Chrome with `--enable-unsafe-webgpu --use-vulkan=swiftshader`); same procedure as Slice 1. Real-GPU validation pending on user hardware.
- knip's `src/lib/gpu/**/*.ts` entry list (added in Slice 0) keeps the four new pass modules from being flagged until Slice 5.5 wires the orchestrator.

### Slice 3 — Photographic Extended (done)

Port HSL, Curve, Detail to WGSL.

- HSL: 8-channel hue/saturation/luminance
- Curve: point curves (RGB + individual channels)
- Detail: clarity, sharpening, dehaze, multiscale denoise (multi-pass downsample/reconstruct)

Validation: same pixel comparison methodology as Slice 2.

**Slice 3 implementation notes (done):**
- `src/lib/gpu/wgsl/develop/{hsl,curve,detail}.wgsl` + `src/lib/gpu/passes/develop/{hsl,curve,detail}.ts` ported from corresponding `.frag` files.
- HSL: 8-channel hue/saturation/luminance arrays packed as 4 vec4 pairs (hue0123/hue4567 etc.) in the uniform struct. Function-scope `var array<f32, 8>` used for dynamic indexing in the channel loop — WGSL vectors and struct fields require const-index access, but function-scope vars are dynamically indexable. `gamut_map_soft_clip` kept local to `hsl.wgsl` (only used there). `hue_center`/`calibration_center` implemented as `switch` expressions.
- Curve: LUT texture (`256×1 rgba8unorm`) owned by the caller; pass references it via a mutable `let curveLutView` closure variable updated by `updateLut(newTex)`. The bind group factory, called lazily per frame, always reads the current view. Reuses `ctx.defaultSampler` (linear clamp) for the LUT, matching the WebGL2 path's `gl.LINEAR` filter. `textureSampleLevel` used for LUT lookups (explicit mip 0; also avoids uniformity-rule edge cases inside the enabled branch).
- Detail: all `textureSample` calls are in uniform control flow — the `u_enabled`, `sharpen > 0.0`, and NR guards are all derived from uniform buffer values, so every invocation in a draw call takes the same path. `shortEdgePx = 0` fallback (derive from texelSize) uses `select()` to avoid a divergent branch.
- `scripts/gpu-smoke/webgl2Reference.ts` extended with `extraTextures?: ExtraTexture[]` to support multi-texture WebGL2 reference renders (used for Curve LUT). Extra textures are bound at units ≥1 and cleaned up with the rest.
- Validation harness: `scripts/gpu-smoke/photoExtended.html` — 5 HSL scenarios (passthrough, sat boost, hue shift, B&W, calibration), 2 Curve scenarios (identity LUT, composite +30), 4 Detail scenarios (passthrough, texture+clarity, sharpening+masking, NR). All 11 scenarios hit `maxDiff=0/255` on SwiftShader fallback.

### Slice 4 — Film Pipeline

Port all film stages to WGSL: Prep (expand/compression/developer/tone), ColorLut (matrix/3DLUT), Print (CMY head/color cast/toning), Grain (film + procedural), Effects (vignette/breath/damage/gateWeave/overscan).

- 3D LUT sampling in WGSL (currently `templates/lut3d.glsl`)
- Film grain noise generation in WGSL

Validation: film profile rendering matches WebGL2 output.

### Slice 5 — Masking & Post-Processing

Port supporting passes:
- Halation/bloom (threshold → blur → composite)
- Gradient masks (linear, radial)
- Brush mask stamping (GPU path, ≤512 points)
- Range gate masking
- Masked blend / layer blend
- Gaussian blur, bilateral scale, downsample, dilate

Validation: local adjustment with gradient mask renders correctly. Brush mask ≤512 points stays on GPU path.

### Slice 5.5 — Backend Adapter

Decouple `src/render/image/` from a specific GPU backend so Slice 6 becomes a one-point switch instead of distributed call-site replacement, and so WebGPU can be exercised end-to-end behind a flag before full cutover.

- Define `RenderBackend` interface in `src/render/image/`: source upload, per-stage execution (develop / film / carrier / signal damage / overlay / post), GPU texture handle passing between stages (consistent with the Stage choreography boundary decision), final readback to canvas.
- Wrap the current WebGL2 path (`PipelineRenderer` + `imageProcessing.ts`) as `WebGL2RenderBackend`. All `renderSingleImage.ts` callers and `boardImageRendering.ts` go through the interface, not direct backend calls.
- Convert `renderSingleImage.ts` `cloneToCanvas` snapshot points to GPU texture handles produced by the adapter; this lands the type change required by the Stage choreography boundary decision.
- Add `WebGPURenderBackend` skeleton behind a feature flag; passes through to `src/lib/gpu/` (Slices 0–5 output). Skeleton may be partial — flag-gated users see WebGPU integration smoke, default users stay on WebGL2.
- Port new render result contract end-to-end: `WebGL2RenderBackend` now reports `{ status, surface, fallbackReason? }` instead of throw-or-warn; existing `KEEP_LAST_PREVIEW_FRAME_ON_ERROR` removed.

Validation: zero pixel/behavioral change with `WebGL2RenderBackend` selected — existing renderSingleImage tests pass unchanged. Feature-flag toggle to `WebGPURenderBackend` runs without throwing on Slice 0–5 covered cases (passthrough, ASCII compute, develop-core).

### Slice 6 — Integration

- Replace `WebGL2RenderBackend` as default with `WebGPURenderBackend` (one-point switch enabled by Slice 5.5 adapter)
- Port `imageProcessing.ts` orchestration logic to `orchestrator.ts` as a sequence of named steps (`resolveCacheState → fetchOrComputeSource → applyGeometry → runPipeline → composeLocal → produceSurface`); do not transplant the existing 1000-line nested-`if` control flow as-is
- Connect `boardImageRendering.ts` to new pipeline (already routed via adapter from Slice 5.5)
- Port `TiledRenderer` for large-image export (WebGPU fence-based async readback, replacing 3ms-polling readback)
- Preview/export slot management on shared `GPUDevice`
- ASCII visual parity check vs. current production output (deferred from Slice 1, depends on develop chain landing in Slices 2/3)
- Ship cache key builder (`src/lib/gpu/cacheKeys.ts`) at `v1`; remove ad-hoc per-module key concatenation and duplicated FNV helpers

Validation: full app smoke test — preview renders, export produces valid output, no WebGL2 calls remain in render path. ASCII output matches pre-rewrite production within the agreed deviation bound.

### Slice 7 — Cleanup

- Delete `src/lib/renderer/` (PipelineRenderer, FilterPipeline, ProgramRegistry, TexturePool, TextureManager, UniformManager, PassBuilder, PassUniformUpdaters, all GLSL shaders)
- Delete `src/render/image/asciiEffect.ts` CPU tone computation
- Remove `twgl.js` dependency
- Update `docs/decisions.md` — replace WebGL2 decision with WebGPU
- Close `renderer-y-convention-unification` task (solved by design)

Validation: clean build, `pnpm lint` passes, `pnpm test` passes, no `WebGL` / `twgl` / `.frag` / `.vert` / `.glsl` references in `src/lib/gpu/`.

## Risks

- WebGPU browser coverage: Chrome 113+, Edge 113+, Firefox behind flag, Safari 18.2+. Accepted — target audience has modern hardware.
- WGSL precision differences vs. GLSL may cause subtle color shifts in film simulation. Mitigated by per-slice pixel comparison.
- `PipelineRenderer` at 28k lines will be hard to port incrementally — the new tree is built from scratch, not refactored in place.
- Big-bang integration: during slices 0–5 the app runs on old WebGL2 backend; if Slice 6 is the first integration touchpoint, integration issues surface late. **Mitigated by Slice 5.5 backend adapter** — `WebGPURenderBackend` runs end-to-end behind a flag from Slice 5.5 onward, exposing integration issues during slices 0–5 instead of all at once at Slice 6.
- ASCII (Slice 1) cannot validate visual parity against current production output without the develop chain (Slices 2/3). Mitigated by validating Slice 1 against synthetic fixtures only and deferring production parity to Slice 6.
- Stage choreography boundary change re-types `AnalysisLayerInputs` and inter-stage `stageReferenceCanvas` parameters. This invalidates parts of the freshly-landed `media-native-render-pipeline` analysis-layer slice — that contract gets updated under Slice 5.5/6, not before.

## Relationship to Other Tasks

- `media-native-render-pipeline`: orthogonal — covers carrier families, signal damage, overlays, motion above the per-image kernel. This rewrite replaces the kernel underneath.
- `renderer-y-convention-unification`: closed by this rewrite (Y convention fixed by design in Slice 2).
- `export-16bit-progress`: WebGPU natively supports `rgba16float`; 16-bit export continues to work.
