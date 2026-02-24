# Film Pipeline (v1)

FilmLab now uses a decoupled film rendering pipeline built around `FilmProfile`.

## Modules

The renderer runs modules in this order:

1. `colorScience`
2. `tone`
3. `scan`
4. `grain`
5. `defects`

Each module has:

- `enabled`
- `amount` (0-100)
- `params`
- optional `seedMode` and `seed`

## Core files

- `src/types/index.ts` - `FilmProfile` and module schemas
- `src/data/filmProfiles.ts` - built-in film profile assets
- `src/lib/film/profile.ts` - defaults, normalization, adjustment -> profile mapping
- `src/lib/film/registry.ts` - preset/profile resolution and intensity scaling
- `src/lib/renderer/` - PixiJS multi-pass rendering pipeline
- `src/lib/imageProcessing.ts` - crop/transform + rendering integration

## Seed behavior

`seedMode` supports:

- `perAsset`
- `perRender`
- `perExport`
- `locked`

Use `seedKey` for stable asset-level results in preview/export.

## Renderer strategy

`imageProcessing` uses the PixiJS multi-pass pipeline as the sole rendering backend.
Film profile data is mapped to shader uniforms via `src/lib/renderer/uniformResolvers.ts`.
Render execution is incremental by dirty-key (`source -> geometry -> master -> hsl -> curve -> detail -> film -> optics -> output`)
with per-mode frame state in `RenderManager`, so preview slider updates can skip CPU geometry and
GPU source re-upload when only non-geometry uniforms change.
Geometry transform is now a dedicated GPU pass (`GeometryFilter`) in front of master/film/optics,
while CPU geometry draw is retained as rollback path (and error fallback).
Export rendering supports slot-based parallelism (default 2 workers in workspace export), with
each slot owning independent renderer/frame-state/mutex to avoid preview blocking.
Film grain now uses blue-noise texture sampling (`public/noise/blue-noise-64.png`) instead of
per-pixel hash noise to reduce large-area pattern artifacts.
Preview render failures are handled in non-strict mode by keeping the last successful frame when possible,
then falling back to geometry-only output.

For render-time profile resolution, `src/lib/film/renderProfile.ts` now builds a
canonical payload that supports both legacy v1 behavior and v2 profile features
(including LUT path/size/intensity handoff).

Runtime gray/rollback flags are centralized in `src/lib/renderer/config.ts`
(`filmlab:feature:*`, `filmlab:exportConcurrency`, timing diagnostics keys).

## Module overrides

Assets can store `filmOverrides` (per-module `enabled`/`amount`/`params`) without
mutating the base preset profile. Final profile resolution is:

1. resolve preset/runtime base profile
2. apply asset-level `filmOverrides`
