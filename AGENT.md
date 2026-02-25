# FilmLab Agent Guide

> Last updated: 2026-02-16  
> Scope: current codebase status (not historical proposal)

## 1. Project Summary

FilmLab is a web photo-editing app focused on film look workflows:

- Batch workflow in `Workspace` (`/`)
- Fine-tune workflow in `Editor` (`/editor`)
- Asset persistence with IndexedDB
- AI film preset recommendation via OpenAI endpoint
- Render architecture:
  - PixiJS multi-pass renderer (Master + Film + Halation/Bloom)
  - Throws `RenderError` when WebGL2 is unavailable

## 2. Runtime Entry Points

- `src/main.tsx`: app bootstrap
- `src/App.tsx`: layout shell + project initialization
- `src/router.tsx`:
  - `/` -> `Workspace`
  - `/editor` -> `Editor`

## 3. Main Folders

```text
src/
  components/                # shared components + ui primitives
  features/workspace/        # workspace feature modules
  pages/                     # route pages + editor subcomponents
  stores/                    # zustand stores
  lib/
    imageProcessing.ts       # render entry (PixiJS-only pipeline)
    film/                    # v1 film profile data model
    renderer/                # PixiJS multi-pass pipeline
    db.ts                    # IndexedDB adapter
    assetMetadata.ts         # EXIF + thumbnail pipeline
    ai/                      # client-side recommendation requester
  data/                      # built-in presets/profiles
  types/                     # business types (+ v2 film type)
api/
  recommend-film.ts          # AI recommendation endpoint
scripts/
  generate-shaders.ts        # compile-time shader generator
docs/
  editor.md                  # editor/render architecture doc
```

## 4. Rendering Architecture

### 4.1 `renderImageToCanvas` selection flow

`src/lib/imageProcessing.ts` uses the PixiJS multi-pass pipeline as the sole rendering backend:

1. PixiJS multi-pass pipeline (Master + Film + Halation/Bloom)

### 4.2 PixiJS pipeline (`src/lib/renderer/`)

- `PixiRenderer.ts`
  - Pass 1: `MasterAdjustmentFilter`
  - Pass 2: `FilmSimulationFilter`
  - Pass 3: `HalationBloomFilter`
- `uniformResolvers.ts`
  - `EditingAdjustments -> MasterUniforms`
  - `FilmProfile(v1/v2) -> FilmUniforms/HalationBloomUniforms`
- `LUTLoader.ts` + `LUTCache.ts`
  - HaldCLUT image -> WebGL 3D texture
- Shader generation
  - config: `shader.config.ts`
  - templates: `shaders/templates/*.glsl`
  - output: `shaders/generated/*` (gitignored)

### 4.3 Film profile data model (`src/lib/film/`)

- `profile.ts`: v1 `FilmProfile` defaults/normalization/mapping
- `registry.ts`: preset/profile resolution and intensity scaling
- `migrate.ts`: v1 -> v2 migration helper

## 5. Data and State

### 5.1 Persistence

- IndexedDB name: `filmlab-mvp`
- Stores:
  - `project`
  - `assets`
- Adapter: `src/lib/db.ts`

### 5.2 State stores

- `src/stores/projectStore.ts`
  - project/assets lifecycle
  - import/preset apply/persistence
- `src/stores/editorStore.ts`
  - editor UI state
  - section toggles/custom presets/local UI helpers

### 5.3 Asset ingestion

`src/lib/assetMetadata.ts`:

- reads EXIF via `exifr`
- generates thumbnail blob
- normalizes metadata for UI/store

## 6. Type System Notes

### 6.1 Production baseline

- Main runtime profile type is still `FilmProfile` v1 in `src/types/index.ts`
- `FilmProfileV2` exists in `src/types/film.ts` for new renderer mapping
- V2 currently coexists with V1 and is resolved at runtime in mapping layer

### 6.2 Editing inputs

`EditingAdjustments` includes:

- basic tone controls
- HSL per-color channels
- detail/noise controls
- geometry transforms
- grain/vignette and optics toggles

## 7. AI Recommendation Flow

- Client request: `src/lib/ai/client.ts`
- API route: `api/recommend-film.ts`
- Model: `gpt-4.1-mini`
- Input:
  - image data URL
  - metadata
  - candidate presets
- Output:
  - ranked `topPresets[]` with reason/confidence
- Includes retry/backoff and response sanitization

## 8. Commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm generate:shaders`
- `pnpm vitest`

Notes:

- `dev`/`build` scripts call shader generation before Vite/typecheck.
- generated shaders are not committed (`src/lib/renderer/shaders/generated/` is ignored).

## 9. Common Engineering Tasks

### 9.1 Add a new adjustment param

1. Update `src/types/index.ts` (`EditingAdjustments`)
2. Update mapping in `src/lib/film/profile.ts` (if legacy path needs it)
3. Update `src/lib/renderer/types.ts` and `uniformResolvers.ts`
4. Update shader templates/config if Pixi path needs it
5. Run `pnpm generate:shaders`
6. Add UI control in editor/workspace panels

### 9.2 Add a LUT-based film profile

1. Put LUT asset under `public/luts/`
2. Define profile mapping (v1 and/or v2 use path)
3. Ensure `FilmSimulationFilter.loadLUT()` is triggered by the profile
4. Validate dimensions/level in `LUTLoader.ts`

### 9.3 Debug render mismatch

1. Inspect generated shaders in `src/lib/renderer/shaders/generated/`
2. Verify uniform mapping in `uniformResolvers.ts`
3. Check console for WebGL compile/bind errors
4. Check if `RenderError` is being thrown (WebGL2 unavailable or invalid frame)

## 10. Known Gaps and Risks

- PixiJS is the sole GPU rendering path; `RenderError` is thrown when WebGL2 is unavailable
- `sampler3D` in PixiJS v7 requires manual texture binding workaround
- Some Chinese UI strings appear with mojibake in source files and need unified UTF-8 cleanup
- Test coverage exists but is limited (mostly AI utilities)

## 11. Review Checklist (for PRs touching render/data path)

- Pipeline in `imageProcessing.ts` still behaves as expected
- New params are mapped end-to-end (UI -> type -> uniform -> shader)
- IndexedDB schema compatibility preserved
- GPU resources are released (`dispose`/texture cleanup)
- PixiJS rendering path works correctly

## 12. Document Index

- Quick repo guide: `AGENTS.md`
- This file (engineering baseline): `AGENT.md`
- Editor/render deep dive: `docs/editor.md`
- Film profile data model: `docs/film_pipeline.md`
- Project status notes: `docs/project_status.md`
