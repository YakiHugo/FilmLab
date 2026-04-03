# ASCII Textmode Kernel

- Status: done
- Scope: reshape the ASCII carrier into a textmode-style kernel with an explicit packed cell surface between analysis and presentation, while keeping the current public carrier API and Canvas2D fallback stable.

## Current State

- `src/render/image/asciiEffect.ts` already separates:
  - source analysis
  - feature-grid construction
  - textmode-surface materialization
- The runtime now has a packed analysis surface and a packed presentation surface.
- `FeatureGrid` is now a pure analysis artifact again; source-image background state lives only on the presentation surface.
- The analysis cache now stores only packed sampled data; it no longer clones source canvases or keeps CPU blurred-background caches alive.
- ASCII analysis now prefers a renderer-backed GPU cell-grid resample/readback path before falling back to Canvas2D sampling.
- The analysis artifact is now cell-space rather than image-space: the cache stores `columns x rows` sampled cell data, not a larger intermediate analysis bitmap.
- The presenter now tries a renderer-backed GPU path first and falls back to Canvas2D only when the renderer path is unsupported or fails.
- ASCII carrier presentation now prefers a direct GPU carrier shader path that consumes the source image and resolves tone, edge, background, and glyph layers in-shader before falling back to the packed textmode presenter.
- Timestamp overlays now prefer a glyph-atlas GPU composite path on both surfaces and canvases; cached Canvas2D raster overlays remain only as fallback.
- Overlay execution is now surface-aware end to end:
  - it first tries direct GPU overlays on `RenderSurfaceHandle`
  - then falls back to overlay-canvas-to-surface blend
  - then falls back to direct GPU overlays on the final canvas
  - cached Canvas2D raster overlays are the last fallback
- `renderSingleImage` now keeps overlay ordering explicit: finalize effects are only allowed to stay on surfaces when overlays also stayed on surfaces first.
- The remaining CPU work in this area is now intentional fallback:
  - the packed textmode presenter remains the CPU-safe ASCII fallback when direct GPU presentation is unavailable
  - cached Canvas2D timestamp rasters remain the CPU-safe overlay fallback when GPU overlay composition is unavailable
  - canvas stage-composite remains the final fallback boundary when renderer-backed surface composition cannot be satisfied

## Decisions

- Keep `FeatureGrid` as the analysis-facing artifact for now.
- Introduce an explicit textmode-style packed cell surface between `FeatureGrid` and presentation.
- Keep `applyImageAsciiCarrierTransform(...)` stable so `carrierExecution` and `renderSingleImage` do not need a public API migration in this slice.
- Treat Canvas2D materialization as the CPU presenter for the new packed surface, not as the canonical runtime shape.
- Keep CPU fallbacks, but only as renderer failure boundaries rather than equal-authority runtime paths.
- Do not widen this slice into:
  - glyph-atlas WebGL rendering
  - new authored-state params
  - non-ASCII carrier families
  - board/export pipeline changes

## Slice Plan

### Slice 1. Packed Cell Surface

- Add a textmode-style packed surface that stores per-cell presentation attachments in dense arrays instead of per-cell draw objects.
- Keep the current ASCII visual behavior and existing carrier ordering intact.
- Route the current CPU presenter through the new packed surface.

### Slice 2. Remove Transitional Compatibility Layers

- Collapse `FeatureGrid` into packed arrays instead of per-cell JS objects.
- Remove any temporary compatibility projection back into legacy cell-object surfaces.
- Keep only two runtime artifacts:
  - packed analysis grid
  - packed textmode presentation surface

### Slice 3. GPU Presenter Follow-up

- Add a renderer-backed presenter that consumes the packed cell surface directly.
- Keep the Canvas2D presenter as fallback for unsupported environments or overflow cases.

### Slice 4. GPU Upload And Surface Reuse Follow-up

- Reduce per-render transient texture creation for packed cell data.
- Consider renderer-slot surface return for ASCII when the next consumer remains inside the image pipeline.
- Keep Canvas2D fallback behavior intact.

### Slice 5. GPU Analysis And Overlay Raster Follow-up

- Reduce or eliminate CPU `ImageData` reads in ASCII analysis.
- Decide whether timestamp/text overlays should keep Canvas2D raster generation or move to atlas-backed GPU text rendering.
- Keep current Canvas2D fallback behavior intact.

## Validation Boundary

- No authored-state schema changes.
- No stage ordering changes in `renderSingleImage`.
- Existing ASCII carrier snapshots, masks, and revision keys must remain stable.
- This slice passes when:
  - the analysis and presentation boundaries are both packed artifacts
  - the GPU presenter consumes the packed textmode surface directly
  - the current CPU presenter remains as fallback
  - focused ASCII unit tests cover the new artifact

## Validation

- Pass: `pnpm vitest run src/lib/renderer/PipelineRenderer.asciiTextmode.test.ts`
- Pass: `pnpm vitest run src/lib/renderer/gpuSurfaceOperation.test.ts`
- Pass: `pnpm vitest run src/lib/timestampOverlay.test.ts`
- Pass: `pnpm vitest run src/render/image/carrierExecution.test.ts`
- Pass: `pnpm vitest run src/render/image/stageMaskComposite.test.ts`
- Pass: `pnpm vitest run src/render/image/asciiEffect.test.ts`
- Pass: `pnpm vitest run src/render/image/asciiGpuPresentation.test.ts`
- Pass: `pnpm vitest run src/lib/renderer/ProgramRegistry.test.ts`
- Pass: `pnpm vitest run src/render/image/renderSingleImage.test.ts`
- Pass: `pnpm vitest run src/render/image/renderSingleImage.timestampOverlay.integration.test.ts`
- Pass: `pnpm vitest run src/lib/renderer/gpuSurfaceOperation.test.ts src/render/image/asciiAnalysis.test.ts src/lib/renderer/PipelineRenderer.asciiTextmode.test.ts src/lib/timestampOverlay.test.ts src/render/image/carrierExecution.test.ts src/render/image/stageMaskComposite.test.ts src/render/image/asciiEffect.test.ts src/render/image/asciiGpuPresentation.test.ts src/lib/renderer/ProgramRegistry.test.ts src/render/image/renderSingleImage.test.ts src/render/image/renderSingleImage.timestampOverlay.integration.test.ts`
- Pass: `pnpm exec tsc --noEmit --pretty false`
- Pass: `git diff --check`

## Handoff

- Slice 1 through Slice 3 are landed:
  - ASCII now builds a packed textmode-style cell surface before presentation
  - `FeatureGrid` is now also packed; per-cell JS object artifacts are removed from the runtime
  - `applyImageAsciiCarrierTransform(...)` now tries a renderer-backed GPU presenter first
  - unsupported blend modes or renderer failures fall back to the Canvas2D presenter
- Slice 4 is landed:
  - renderer-side packed cell upload textures are now cached by `surface.cacheKey`
  - keyed surfaces reuse uploaded foreground/background/glyph-index/dot-radius textures across renders
  - cache-less surfaces still use transient textures and release them immediately
  - unmasked ASCII carriers can now stay on renderer surfaces and feed subsequent style `filter2d` surface passes before the first materialization
  - masked ASCII carriers can now also stay on renderer surfaces when GPU mask blend succeeds
  - the canvas stage-composite path remains the explicit fallback boundary when masked surface composition cannot be satisfied
  - `blurred-source` backgrounds now use a renderer-side blur path instead of prebuilding a CPU blurred canvas
  - finalize overlays are rendered once to overlay canvases, then blended onto surfaces when possible
  - finalize `filter2d` effects can now continue from the overlaid surface before the final materialization
- Slice 5 is landed:
  - ASCII analysis cache entries now keep only packed sampled arrays; source-canvas clones and CPU blurred-background caches are removed
  - `FeatureGrid` no longer carries source-canvas presentation state
  - `AsciiTextmodeSurface` now uses a single background model: fill color and optional source-canvas-plus-blur metadata
  - the CPU presenter fallback mirrors the GPU presenter contract instead of supporting a second background-canvas compatibility branch
  - ASCII analysis now tries a renderer-backed cell-grid downsample/readback path before falling back to Canvas2D `drawImage + getImageData`
  - WebGL readback rows are normalized back into top-down cell order before feature extraction
  - the analysis cache key now includes cell layout, and the cached artifact itself is `rawRgbaByCell + alpha/luminance/edge` instead of an image-space bitmap
  - the direct GPU carrier path now bypasses `FeatureGrid` and the packed textmode surface entirely on the main path: it samples the source image into a cell grid in-shader and resolves glyph/background presentation directly
  - timestamp overlays now first resolve a packed GPU overlay input, then composite directly through a renderer shader on either surfaces or canvases before falling back to cached Canvas2D rasters
  - timestamp text normalization is now shared across GPU and CPU overlay paths, so renderer availability no longer changes the rendered string
  - renderer-backed pixel readback now holds its slot mutex until async extraction resolves and disposes the slot on async readback failure
  - glyph atlas textures are now LRU-pruned instead of growing without bound across long-lived sessions with varying glyph/font/layout combinations
  - overlay execution now preserves `carrier -> overlay -> finalize` ordering even when overlays cannot remain on surfaces
- The runtime now keeps only:
  - packed analysis grid
  - packed textmode presentation surface
- There is no pending slice in this task. Future follow-up, if needed, should treat the current GPU-first carrier and overlay paths as the baseline and optimize only measured hotspots inside those paths.
