# FilmLab Editor Architecture (Current)

> Version: v2026.02.20  
> Scope: implementation-aligned documentation for the current repository

## 1. Goals and Scope

This document describes the editor/workspace implementation that is already in code:

- Route-level UX (`Workspace` + `Editor`)
- Rendering pipeline selection and internals
- Data/state/persistence flow
- Shader generation and PixiJS integration details
- Known limitations and next implementation steps

It avoids long-term speculative design and focuses on current behavior.

## 2. Route and Feature Architecture

## 2.1 Routes

- `/` -> `src/pages/Workspace.tsx`
- `/editor` -> `src/pages/Editor.tsx`

Router is defined in `src/router.tsx` with search params:

- `/`: `step` in `library | style | export`
- `/editor`: optional `assetId`, optional `returnStep` in `library | style | export` (fallback: `style`)

## 2.2 Workspace

`src/pages/Workspace.tsx` drives a 3-step workflow:

1. Library/import
2. Style/preset application
3. Export

Business logic is delegated to `src/features/workspace/hooks/useWorkspaceState.ts`.

Export step includes `ExportPreviewGrid` (`src/features/workspace/components/ExportPreviewGrid.tsx`),
with view-only `exportPreviewItems` derived from assets + export task status.

## 2.3 Editor

`/editor` now runs in an independent full-screen shell (without global app header/max-width container)
and uses a Lightroom-style working layout:

- top action bar: return, asset info, undo/redo, compare, copy/paste settings, reset
- center preview canvas: zoom/pan/pick-color/keyboard shortcuts
- tool rail: `preset | edit | crop | mask | remove(disabled) | ai`
- right inspector: histogram card (shown only when active tool is `edit`) + panel-mapped section content

Editor keeps a single return entry (`杩斿洖宸ヤ綔鍙癭) and routes back to `/?step=<returnStep>`.
Direct in-panel jump-to-export remains intentionally removed to keep one clear exit path.

Current composition modules:

- `src/pages/editor/layout/EditorTopBar.tsx`
- `src/pages/editor/layout/EditorToolRail.tsx`
- `src/pages/editor/layout/EditorInspectorPanel.tsx`
- `src/pages/editor/EditorPreviewCard.tsx`
- `src/pages/editor/EditorHistogramCard.tsx`
- `src/pages/editor/EditorAdjustmentPanel.tsx` (`EditorInspectorContent`)

Undo/redo shortcuts in preview:

- `Cmd/Ctrl + Z`: undo
- `Cmd/Ctrl + Shift + Z`: redo
- `Ctrl + Y`: redo
- `O`: toggle original/adjusted compare
- `+/-`: zoom in/out
- `0`: fit to viewport
- In `EditorSliderRow` controls, clicking the numeric value enters inline input mode; press `Enter` or blur to commit, `Esc` to cancel.
- `Preset` panel now shows AI recommendations on top, and all other presets sorted lexicographically.
- `Edit` panel is grouped as `Basic / Effects / Detail / Timestamp / Advanced`.
- Timestamp stamping supports `enable + position + size + opacity`, with EXIF capture time preferred and import time fallback.
- `Advanced` keeps point-curve, HSL picking, color grading, optics toggles, and film module overrides.
- `Mask` panel now hosts Local Adjustments (`localAdjustments`) with radial/linear/brush masks, per-mask enable/invert/amount, luminance range controls (`lumaMin/lumaMax/lumaFeather`), hue/saturation range controls (`hueCenter/hueRange/hueFeather/satMin/satFeather`), brush paint-on-preview controls (`brushSize/feather/flow`), preview color-pick to set mask hue center, and local delta sliders (exposure/contrast/highlights/shadows/temperature/tint/saturation/clarity/dehaze).
- `Crop` panel supports fixed-ratio/free-ratio crop overlay with corner + edge handles; horizontal/vertical/scale are now controlled only by crop-box interaction (no separate form sliders). Crop-box geometry center is always locked to preview center; handle drags perform center-symmetric resize, and long-press + drag inside the crop box pans the image underneath.
- Crop rotate icon actions are discrete `90掳` steps per click (clockwise/counter-clockwise), while the straighten slider remains continuous.
- Guided perspective mode allows drawing 1-2 reference lines directly on preview before applying correction.
## 2.4 Histogram mode behavior

Editor histogram stays RGB-oriented, but adds automatic monochrome overlap rendering:

- Histogram data is sampled from the current preview source (original image when compare/original mode is on, rendered canvas otherwise).
- Runtime model includes `r/g/b` plus `luma`, with `mode` in `rgb | rgb-monochrome-overlap`.
- Monochrome detection is pixel-content based (not preset or film `bw` tags):
  - Ignore near-transparent pixels (`alpha <= 8`).
  - Compute channel delta per sample: `max(r,g,b) - min(r,g,b)`.
  - Mark as monochrome when:
    - strict rule: `p95ChannelDelta <= 8` and `meanChannelDelta <= 5`, or
    - fallback overlap rule: normalized RGB histogram overlap stays tight (`maxAbsBinDelta <= 0.04` and `maxL1BinDelta <= 0.75`).
- UI behavior:
  - `rgb`: render the existing RGB three-channel histogram.
  - `rgb-monochrome-overlap`: render neutral gray overlap using `luma`, with label `鐩存柟鍥撅細RGB锛堢伆搴﹂噸鍙狅級`.
- Source-aware override for BW photos:
  - Editor first detects whether the original source image is monochrome.
  - If source is monochrome, histogram display mode is forced to `rgb-monochrome-overlap` for both original and adjusted preview, matching Lightroom-style BW presentation.

## 3. State and Persistence

## 3.1 Global stores

- `src/stores/projectStore.ts`
  - project + asset lifecycle
  - import and persistence
  - preset application and asset updates
- `src/stores/editorStore.ts`
  - editor UI state
  - section expand/collapse
  - active tool panel + mobile inspector expand/collapse
  - custom preset and preview state
  - per-asset in-memory history stacks for undo/redo

## 3.2 Persistence model

- IndexedDB via `idb` (`src/lib/db.ts`)
- DB name: `filmlab-mvp`
- object stores:
  - `project`
  - localMaskBlobs (large brush-mask point sets offloaded from asset payloads)

Stored asset payload includes blob, metadata, adjustments, film profile info, and AI recommendation result.

## 3.3 Asset metadata pipeline

`src/lib/assetMetadata.ts`:

- Extract EXIF with `exifr`
- Generate thumbnails
- Normalize values for UI display and persistence

## 4. Rendering Pipeline

## 4.1 Entry point

`src/lib/imageProcessing.ts` exposes:

- `renderImageToCanvas(...)`
- `renderImageToBlob(...)`

The function resolves runtime render config (`src/lib/renderer/config.ts`), then builds the render graph.
Preview and export now run with explicit render modes:

- `mode: "preview"`: non-strict GPU failure handling (keeps last successful frame first, geometry fallback as last resort)
- `mode: "export"`: strict GPU failure handling (throws and fails export)

`imageProcessing` now runs as an incremental pipeline with per-mode frame state:

- `source/geometry/master/hsl/curve/detail/film/optics/output` dirty keys
- cached geometry canvas per mode (`RenderManager` frame state)
- cached pre-film intermediate canvas (`Geometry -> Master -> HSL -> Curve -> Detail`)
- when only film/optics keys change, pre-film stage is reused and only the final stage is re-rendered
- Pixi source upload skipped when geometry key is unchanged
- output compositing skipped when Pixi output key and timestamp output key are unchanged
- when local adjustments are active, base Pixi output is composited with per-mask local renders in canvas space before timestamp overlay
- optional timing diagnostics via `localStorage["filmlab:renderTiming"] = "1"`
- verbose per-pass CPU timing via `localStorage["filmlab:renderTimingVerbose"] = "1"`
- runtime feature flags / rollback switches via `filmlab:feature:*` keys

## 4.2 Backend

PixiJS multi-pass pipeline is the sole rendering backend. When WebGL2 is unavailable or produces an invalid frame, a `RenderError` is thrown and surfaced to the user.

## 4.3 PixiJS backend (`src/lib/renderer/`)

`PixiRenderer.ts` composes 7 passes:

1. `GeometryFilter`
2. `MasterAdjustmentFilter`
3. `HSLFilter`
4. `CurveFilter`
5. `DetailFilter`
6. `FilmSimulationFilter`
7. `HalationBloomFilter`

Renderer lifecycle is now managed by `RenderManager.ts`:

- Dedicated preview slot renderer (`preserveDrawingBuffer: false`)
- Export renderer pool by slot (`preserveDrawingBuffer: true`, default parallelism 2 in workspace export)
- Per-slot renderer reuse and context-loss recreation
- Per-slot `FrameState` for dirty tracking, geometry-cache ownership, and last render error state

`src/lib/renderer/config.ts` supports runtime rollback/gray switches through localStorage:

- `filmlab:feature:incremental` (`1/0`): incremental dirty re-render on/off
- `filmlab:feature:gpuGeometry` (`1/0`): GPU geometry pass on/off (off -> CPU geometry upload path)
- `filmlab:feature:hsl|curve|detail|film|optics` (`1/0`): per-pass gating
- `filmlab:feature:keepLastPreviewFrameOnError` (`1/0`): keep previous preview frame when render fails
- `filmlab:exportConcurrency` (`1..3`): export worker pool size (default `2`)

### Pass details

- Pass 1 (`GeometryFilter`)
  - crop/rotate/scale/flip/translate in GPU
  - optional perspective correction via homography (`perspectiveEnabled + perspectiveHorizontal/Vertical`) with crop-panel auto modes (`auto/level/vertical/full/guided`)
  - optional lens profile correction (`opticsProfile`) using a two-term Brown-Conrady radial model (`k1 + k2*r^4`), RGB-split chromatic aberration correction (`opticsCA`), and lens vignette correction strength (`opticsVignette`)
  - source upload and geometry uniforms are decoupled so transform-only updates avoid re-upload
- Pass 2 (`MasterAdjustmentFilter`)
  - master color/tone adjustments
  - linear-space operations with LMS/OKLab helpers in generated shader
  - white balance supports legacy offset sliders and optional absolute mode (`temperatureKelvin` + `tintMG`)
  - always re-encodes to sRGB at pass output (downstream passes no longer consume linear RGB)
  - dehaze uses a dark-channel transmission approximation instead of pure contrast remap
- Pass 3 (`HSLFilter`)
  - per-hue selective hue/saturation/luminance adjustments (8 color bands)
  - sRGB -> linear -> OKLab edit -> sRGB (replaces previous HSV-space math)
  - optional B&W mix (`bwEnabled` + `bwMix`) converted in-pass after color adjustments
  - optional calibration primaries (`calibration.red/green/blue hue+saturation`) applied with narrow hue windows
- Pass 4 (`CurveFilter`)
  - point-curve LUT pass (RGB + R/G/B channels)
  - LUT generation uses monotone cubic Hermite interpolation (replaces linear segment interpolation)
  - legacy 4-slider tone curve is bridged into this pass for compatibility
- Pass 5 (`DetailFilter`)
  - multi-scale texture/clarity/sharpen pipeline
  - 5x5 bilateral luma/chroma noise reduction
- Pass 6 (`FilmSimulationFilter`)
  - input interpreted as sRGB from previous pass
  - tone response + color matrix in linear space
  - converted back to sRGB before LUT/color cast/blue-noise grain/vignette
- Pass 7 (`HalationBloomFilter`)
  - threshold -> blur H/V -> composite
  - threshold luminance is evaluated in linear space (threshold uniforms are resolved from sRGB UI values)
  - uses filter texture pool to avoid leaks

## 4.4 Uniform mapping

`src/lib/renderer/uniformResolvers.ts` contains all mapping entry points:

- `resolveFromAdjustments(...)`
- `resolveFilmUniforms(...)` (v1)
- `resolveFilmUniformsV2(...)` (v2)
- `resolveHalationBloomUniforms(...)` / `...V2(...)`

This file is the canonical bridge between UI/business data and shader inputs.

`src/lib/film/renderProfile.ts` now provides a canonical render-profile resolver:

- keeps legacy v1 behavior for runtime/generated profiles
- enables v2-specific mapping and LUT loading when a v2 profile is supplied

## 5. Shader Generation

Compile-time generator:

- script: `scripts/generate-shaders.ts`
- config: `src/lib/renderer/shader.config.ts`
- templates: `src/lib/renderer/shaders/templates/*.glsl`
- output: `src/lib/renderer/shaders/generated/*` (gitignored)

The generator enables/disables shader sections based on config and writes:

- `MasterAdjustment.frag`
- `FilmSimulation.frag`
- `default.vert` (copied)

Commands:

- `pnpm generate:shaders`
- `pnpm baseline:render` (refreshes `docs/render_baseline.md` asset manifest + benchmark procedure)
- `pnpm dev` and `pnpm build` already invoke generation before start/build

## 6. Film Profile Model (v1 and v2)

## 6.1 V1 (runtime baseline)

`FilmProfile` in `src/types/index.ts` with 5 modules:

1. `colorScience`
2. `tone`
3. `scan`
4. `grain`
5. `defects`

This is still the dominant runtime profile format.

## 6.2 V2 (new structured format)

`FilmProfileV2` in `src/types/film.ts` introduces layered structure for the new renderer.

Migration helper:

- `src/lib/film/migrate.ts`
  - `migrateFilmProfileV1ToV2(...)`
  - `ensureFilmProfileV2(...)`

Both formats currently coexist.

## 7. AI Recommendation Integration

Client side:

- `src/lib/ai/client.ts`
  - request + retry/backoff
  - response validation

Server side:

- `api/recommend-film.ts`
  - model call (`gpt-4.1-mini`)
  - candidate filtering and sanitization
  - JSON response contract for top preset matches

## 8. Testing Status

Test framework is available (`vitest`), but coverage is currently partial.

Existing tests are mainly under:

- `src/lib/ai/client.test.ts`
- `src/lib/ai/recommendationUtils.test.ts`
- `src/features/workspace/navigation.test.ts`
- `src/stores/editorStore.history.test.ts`

Rendering and shader paths currently rely more on manual/in-browser verification.

## 9. Known Issues and Constraints

- PixiJS is the sole GPU rendering path; `RenderError` is thrown when WebGL2 is unavailable
- PixiJS v7 does not natively handle `sampler3D`; manual apply internals are isolated in `src/lib/renderer/filters/ManualFilterApply.ts`
- Repository still has mojibake Chinese strings in some UI/source files and docs; UTF-8 cleanup is still needed

## 10. Change Checklist (Editor/Render PR)

When modifying editor/render behavior, verify:

1. Type updates (`src/types/*`) are reflected in store and UI
2. Uniform mapping is updated in `uniformResolvers.ts`
3. Shader config/templates remain consistent
4. `pnpm generate:shaders` output compiles and runs
5. PixiJS rendering path works correctly
6. Export path (`renderImageToBlob`) remains correct
7. IndexedDB payload compatibility is preserved

## 11. Related Docs

- `AGENTS.md`: quick repo contribution rules
- `AGENT.md`: agent-oriented engineering baseline
- `docs/editor-change-history-undo-redo.md`: product + technical plan for editor undo/redo and change history
- `docs/editor-histogram.md`: histogram module behavior, data contract, and iteration guide
- `docs/film_pipeline.md`: film profile data model notes
- `docs/project_status.md`: project-level status tracking


