# Render Compat Retirement

- Baseline: `single-image runtime was already canonical-first, but canvas editing, preset authored shape, state ingress, film/profile resolution, LUT export, and a few utility modules still carried compatibility semantics`
- Final state: `render/canvas/film/export live source is canonical-only; old adjustments-shaped ingress and legacy-v1 runtime branches are retired`

## Decisions

- Treat compatibility retirement as a bounded long task with validated slices, not a single sweep.
- Keep the single-image kernel contract canonical: `source -> develop -> style -> overlay -> finalize`.
- Retire old `adjustments`-shaped ingress instead of continuing to adapt it at runtime.
- Make film/profile resolution state-native and `ResolvedRenderProfile.mode === "v3"` only.
- Continue to accept built-in v1/v2 film definitions as authored inputs only by upgrading them forward into the v3 runtime profile; do not preserve a `legacy-v1` runtime mode.

## Slice Record

### 1. Dead Compatibility Cleanup

- Removed dead timestamp-overlay compatibility helpers and naming residue.
- Deleted the unreferenced canvas image post-processing helper.
- Renamed the image-processing intent mapper to neutral runtime naming.

### 2. Canvas / Preset Input Canonicalization

- Removed `EditingAdjustments`-shaped canvas view models and renamed canvas edit fields to canonical field ids.
- Moved presets to canonical `renderState` authored data.
- Switched canvas node creation and insert fallback to neutral canonical render state.

### 3. Render Ingress Compatibility Retirement

- Rewrote `src/render/image/stateCompiler.ts` to canonical-only helpers.
- Removed legacy mask/effect ids and compatibility-only ASCII behavior.
- Replaced timestamp overlay’s `EditingAdjustments` dependency with an explicit overlay options type.
- Removed the now-dead `lib/adjustments` module from live source.
- Rewrote LUT generation to consume canonical render state and canonical uniform resolvers.
- Removed adjustments-based uniform resolver exports and remaining `resolveLegacy*` runtime helpers.

### 4. Film/Profile Compatibility Retirement

- Removed `legacy-v1` resolved-mode output and adjustment-derived profile fallback.
- Reworked registry/profile resolution around canonical film state and preset render state.
- Kept forward migration for authored v1/v2 film definitions, but only as input normalization into the v3 runtime profile.
- Updated board image render context to expose the effective resolved film profile from canonical film state.

### Post-Completion Dead-Tail Cleanup

- Removed unreferenced v1/v2 film uniform resolver exports from `src/lib/renderer/uniformResolvers.ts`.
- Removed the unreferenced `deriveLegacyGroupChildren(...)` helper from `src/features/canvas/document/hierarchy.ts`.

### 6. Final Tail Retirement

- Removed the leftover browser BYOK cleanup side effect from `ProviderApiKeyPanel` and updated the copy to match the new server-managed-only behavior.
- Stopped wrapping stock film built-ins in a synthesized v1 compatibility shell; the built-in registry now consumes the stock v2 profiles directly.
- Removed `Asset.group` from the public runtime/stored asset schema and stopped writing it; load-time import-day normalization still consumes old stored day keys once so legacy assets do not get regrouped.
- Simplified IndexedDB runtime access to the current schema path only, but kept the one-time old-version store recreation during upgrade so older local databases still land on the current schema safely.
- Renamed the asset upload-queue recovery bucket in `assetStore` to neutral naming; it remains current sync recovery logic, not a compatibility path.

## Validation

- Passed targeted render/canvas regression:
  - `pnpm exec vitest --run src/render/image src/lib/film/renderProfile.test.ts src/features/canvas src/stores/canvasStore.test.ts src/lib/db.loadAssets.test.ts`
- Passed full test suite:
  - `pnpm test`
- Passed type validation:
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Passed lint:
  - `pnpm lint`
- Passed production build:
  - `pnpm run build`
- Passed live-source inventory:
  - PowerShell `Select-String` across non-test files under `src/`
  - no matches for `resolveLegacy`, `legacy-`, `legacyV1`, `mode: "legacy-v1"`, `EditingAdjustments`, `createDefaultAdjustments`, `normalizeAdjustments`
- Passed final tail-retirement regression:
  - `pnpm exec vitest --run src/lib/film/renderProfile.test.ts src/stores/currentUserStore.migration.test.ts src/features/canvas/boardImageRendering.test.ts src/features/canvas/renderCanvasDocument.test.ts src/features/canvas/runtime/canvasPreviewRuntimeState.test.ts src/lib/db.loadAssets.test.ts`
- Passed final tail-retirement inventory:
  - `rg -n "stockFilmProfilesV1|toLegacyStockProfile|getStockFilmProfileV2ById|LEGACY_IMAGE_PROVIDER_STORAGE_KEY|legacyAssets|legacyObjectStoreNames|\\.group\\b|group\\?: string;" src`
  - no matches

## Browser Smoke

Validated against local dev client at `http://localhost:5174`:

1. Opened `/canvas` and verified a workbench route initialized correctly.
2. Opened `Library` and inserted `unsplash_4c7lecfas1M.jpg` onto the canvas.
3. Opened `Layers`, selected the inserted image layer, and entered the `编辑` panel.
4. Adjusted `曝光` from `0` to `+1` through the live slider.
5. Reloaded the page, reselected the same layer, and verified `曝光` still read back as `+1`.

Observed non-blocking browser warnings during smoke:

- Zustand deprecation/devtools warnings in development mode.
- WebGL `INVALID_VALUE: texImage2D: bad image data` warnings.

These warnings did not block the end-to-end flow and were not introduced as task-specific failures during this slice.

Additional tail-retirement smoke:

1. Reopened `/canvas`, uploaded `public/luts/stocks/portra400.png`, and confirmed the imported asset appeared in `Library` and `Layers`.
2. Reloaded `/canvas`, reopened `Library`, and confirmed `portra400.png` still hydrated from IndexedDB after `Asset.group` retirement.
3. Opened `/assist`, expanded `More -> API Keys`, and confirmed the provider panel rendered the server-managed credential state with copy that no longer claims local keys were cleared.

## Handoff

- Task complete.
- If follow-up cleanup is desired, the next separate task should investigate the dev-mode WebGL warnings and Zustand devtools/deprecation warnings; they are not part of render-compat retirement itself.
