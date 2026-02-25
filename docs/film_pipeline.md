# Film Pipeline (v1 + v2 LUT Bridge)

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
- `src/data/filmStockProfiles.ts` - stock-style V2 LUT profiles + V1 compatibility entries
- `src/lib/film/profile.ts` - defaults, normalization, adjustment -> profile mapping
- `src/lib/film/registry.ts` - preset/profile resolution and intensity scaling
- `src/lib/film/renderProfile.ts` - legacy/v2 render-profile selection + stock LUT handoff
- `src/lib/renderer/` - PixiJS multi-pass rendering pipeline
- `src/lib/imageProcessing.ts` - crop/transform + rendering integration
- `scripts/generate_stock_luts.py` - generate `public/luts/stocks/*.png` HaldCLUT assets

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
Geometry pass currently also hosts lightweight lens correction: two-term Brown-Conrady
radial distortion remap (`opticsProfile`), RGB-split lateral chromatic aberration correction (`opticsCA`), and edge-lift
vignette correction (`opticsVignette`).
Perspective correction is integrated in the same pass through a homography uniform driven by
`perspectiveEnabled` + `perspectiveHorizontal/Vertical`.
Color-space flow is explicitly split by pass: Master emits sRGB, HSL/Curve/Detail operate in sRGB
domain assumptions, and Film converts sRGB -> linear only for tone/matrix before returning to sRGB
for LUT/cast/grain/vignette.
Master white balance resolver accepts both legacy offsets (`temperature`/`tint`) and optional
absolute controls (`temperatureKelvin`/`tintMG`) and maps them to LMS scale uniforms.
Pipeline execution is split into two stages with intermediate caching:
`A = Geometry + Master + HSL + Curve + Detail`, `B = Film + Optics`.
When only film/optics dirty keys change, stage A is reused from `FrameState.preFilmCanvas`.
Export rendering supports slot-based parallelism (default 2 workers in workspace export), with
each slot owning independent renderer/frame-state/mutex to avoid preview blocking.
Film grain now uses blue-noise texture sampling (`public/noise/blue-noise-64.png`) instead of
per-pixel hash noise to reduce large-area pattern artifacts.
Preview render failures are handled in non-strict mode by keeping the last successful frame when possible,
then falling back to geometry-only output.

For render-time profile resolution, `src/lib/film/renderProfile.ts` now builds a
canonical payload that supports both legacy v1 behavior and v2 profile features
(including LUT path/size/intensity handoff).
When a selected built-in profile id matches a stock LUT entry (`stock-*`), render mode
switches to V2 and uses `public/luts/stocks/*.png` automatically.

Runtime gray/rollback flags are centralized in `src/lib/renderer/config.ts`
(`filmlab:feature:*`, `filmlab:exportConcurrency`, timing diagnostics keys).

## Module overrides

Assets can store `filmOverrides` (per-module `enabled`/`amount`/`params`) without
mutating the base preset profile. Final profile resolution is:

1. resolve preset/runtime base profile
2. apply asset-level `filmOverrides`
