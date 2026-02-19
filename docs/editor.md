# FilmLab Editor Architecture (Current)

> Version: v2026.02.19  
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

`src/pages/Editor.tsx` is a focused fine-tune page composed from `src/pages/editor/*` modules:

- preview card
- filmstrip
- preset card
- adjustment panel
- per-asset undo/redo controls

Editor uses a single return entry (`返回工作台`) that routes back to `/?step=<returnStep>`.
Direct in-panel jump-to-export is intentionally removed to keep a single exit path.

Undo/redo shortcuts in preview:

- `Cmd/Ctrl + Z`: undo
- `Cmd/Ctrl + Shift + Z`: redo
- `Ctrl + Y`: redo

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
  - `rgb-monochrome-overlap`: render neutral gray overlap using `luma`, with label `直方图：RGB（灰度重叠）`.
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
  - custom preset and preview state
  - per-asset in-memory history stacks for undo/redo

## 3.2 Persistence model

- IndexedDB via `idb` (`src/lib/db.ts`)
- DB name: `filmlab-mvp`
- object stores:
  - `project`
  - `assets`

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

The function first applies geometry transforms (crop/scale/rotate/flip), then chooses a render backend.

## 4.2 Backend selection order

1. PixiJS multi-pass backend (default)
2. Legacy WebGL2 backend (fallback)
3. CPU fallback backend

When PixiJS returns an invalid frame (for example near-transparent or near-black output while source content is visible), runtime will automatically fall back to legacy WebGL2/CPU for that render.

Debug escape hatch to force legacy renderer:

```js
window.__FILMLAB_USE_LEGACY = true;
```

## 4.3 Legacy backend (`src/lib/film/`)

- `webgl2.ts`: legacy single-pass GPU pipeline
- `pipeline.ts`: CPU pixel pipeline fallback
- `profile.ts`: v1 module-based profile normalization/mapping

## 4.4 PixiJS backend (`src/lib/renderer/`)

`PixiRenderer.ts` composes 3 passes:

1. `MasterAdjustmentFilter`
2. `FilmSimulationFilter`
3. `HalationBloomFilter`

### Pass details

- Pass 1 (`MasterAdjustmentFilter`)
  - master color/tone adjustments
  - linear-space operations with LMS/OKLab helpers in generated shader
- Pass 2 (`FilmSimulationFilter`)
  - tone response
  - optional LUT contribution
  - color cast, grain, vignette
- Pass 3 (`HalationBloomFilter`)
  - threshold -> blur H/V -> composite
  - uses filter texture pool to avoid leaks

## 4.5 Uniform mapping

`src/lib/renderer/uniformResolvers.ts` contains all mapping entry points:

- `resolveFromAdjustments(...)`
- `resolveFilmUniforms(...)` (v1)
- `resolveFilmUniformsV2(...)` (v2)
- `resolveHalationBloomUniforms(...)` / `...V2(...)`

This file is the canonical bridge between UI/business data and shader inputs.

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

- PixiJS is the default GPU path; legacy WebGL2 available via `window.__FILMLAB_USE_LEGACY = true`
- PixiJS v7 does not natively handle `sampler3D`, so `FilmSimulationFilter` does manual texture unit binding
- Repository still has mojibake Chinese strings in some UI/source files and docs; UTF-8 cleanup is still needed
- Multi-backend behavior must stay consistent across PixiJS, legacy WebGL2, and CPU fallback

## 10. Change Checklist (Editor/Render PR)

When modifying editor/render behavior, verify:

1. Type updates (`src/types/*`) are reflected in store and UI
2. Uniform mapping is updated in `uniformResolvers.ts`
3. Shader config/templates remain consistent
4. `pnpm generate:shaders` output compiles and runs
5. Both PixiJS default and legacy escape-hatch paths still render
6. Export path (`renderImageToBlob`) remains correct
7. IndexedDB payload compatibility is preserved

## 11. Related Docs

- `AGENTS.md`: quick repo contribution rules
- `AGENT.md`: agent-oriented engineering baseline
- `docs/editor-change-history-undo-redo.md`: product + technical plan for editor undo/redo and change history
- `docs/editor-histogram.md`: histogram module behavior, data contract, and iteration guide
- `docs/film_pipeline.md`: legacy film pipeline notes
- `docs/project_status.md`: project-level status tracking
