# Film Pipeline P0 Baseline

## Feature Flags

- `VITE_ENABLE_CUBE_LUT` (default `false`): enable `.cube` LUT parsing, storage, and rendering.
- `VITE_ENABLE_WORKER_EXPORT` (default `false`): enable export worker + OffscreenCanvas path.
- `VITE_ENABLE_SEED_UI` (default `false`): show seed mode/lock/refresh controls in editor panel.

Flags can also be overridden in `localStorage`:

- `filmlab.flag.enableCubeLut`
- `filmlab.flag.enableWorkerExport`
- `filmlab.flag.enableSeedUi`

## Seed Rules

Module seed is resolved by `seedMode`:

- `locked`: use module-level `seed`.
- `perExport`: use export task seed.
- `perRender`: use render seed.
- `perAsset`: hash of `module.id + asset.id(seedKey) + asset.seedSalt`.

`seedSalt` is persisted on `Asset`, so "refresh seed" is stable across reloads.

## LUT Asset Spec (`.cube`)

- Format: `LUT_3D_SIZE` + RGB rows.
- Current scope: 3D LUT only.
- Storage: IndexedDB `lutAssets` store, with `{ id, name, size, data(Float32Array) }`.
- Fallback: if LUT missing or parsing fails, renderer uses legacy colorScience logic.

## Export Fallback Strategy

1. If worker export is enabled and supported, run worker path first.
2. If worker path fails, fallback to main-thread CPU render.
3. If worker is unavailable, main-thread first tries WebGL2 then retries with CPU.

Each task uses at most one retry and reports progress/status.

## Consistency Threshold

- Default threshold: `MAE <= 2/255` for pixel comparison utilities/tests.

