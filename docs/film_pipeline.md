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
- `src/lib/film/pipeline.ts` - pixel pipeline execution
- `src/lib/film/webgl2.ts` - WebGL2 renderer backend
- `src/lib/imageProcessing.ts` - crop/transform + film pipeline integration

## Seed behavior

`seedMode` supports:

- `perAsset`
- `perRender`
- `perExport`
- `locked`

Use `seedKey` for stable asset-level results in preview/export.

## Renderer strategy

`imageProcessing` will try WebGL2 first via `renderFilmProfileWebGL2`, then fallback to
CPU `applyFilmPipeline` when WebGL2 is unavailable or fails.

## Module overrides

Assets can store `filmOverrides` (per-module `enabled`/`amount`/`params`) without
mutating the base preset profile. Final profile resolution is:

1. resolve preset/runtime base profile
2. apply asset-level `filmOverrides`
