# imageProcessing.ts Refactor

## Goal

Improve context retrieval quality for all AI coding tools — especially Cursor (AST-based chunking) — by splitting the 1360-line `renderImageStageInternal` into sub-functions and extracting stable pure functions to separate files.

## Slices

### Slice 1: Extract cache key functions → `imageProcessingKeys.ts`
- 20+ `create*Key` / `serialize*` pure functions (~400 lines)
- Zero coupling to module state — only take typed params, return strings

### Slice 2: Extract source loading → `imageSourceLoader.ts`
- `loadImageSource`, `createOrientedSource`, bitmap cache, `resolveSourceCacheKey` (~260 lines)
- Self-contained module with independent cache lifecycle

### Slice 3: Split `renderImageStageInternal` into sub-functions (same file)
- Tiled export path → `renderTiledExportPath()`
- HDR linear local composition → extract from nested scope
- Reduces the main function to ~600 lines of orchestration

## Validation
- `pnpm exec tsc --noEmit` per slice
- Existing tests: `pnpm vitest run src/lib/imageProcessing`
