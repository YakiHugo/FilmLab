# 16-bit TIFF Export + Export Progress Feedback

## Scope

Add 16-bit TIFF export path (single-image only) and progress callback for canvas document export.

## Slices

### Slice 1: 16-bit TIFF encoder
- `src/lib/export/tiff.ts` — `encodeFloat32RgbaToTiff16()` 
- Mirrors existing 8-bit encoder, BitsPerSample=16, SampleFormat tag, float→uint16 conversion

### Slice 2: Float readback from GPU
- `src/lib/renderer/PipelineRenderer.ts` — `extractLinearPixelsFloat32()`
- Promote `supportsFloatRenderTarget` to instance field
- FBO-based readback of `capturedLinearResult` texture

### Slice 3: Export progress callback
- `src/features/canvas/renderCanvasWorkbench.ts` — `onProgress` in element loop
- `src/features/canvas/hooks/useCanvasExport.ts` — thread callback
- `src/features/canvas/CanvasExportDialog.tsx` — progress bar UI

### Slice 4: Wire 16-bit TIFF into export UI
- Extend `CanvasExportFormat` to include `"tiff"`
- Add TIFF option + 16-bit toggle in export dialog
- 16-bit only for single-image workbenches; fallback to 8-bit on weak GPUs

## Decisions
- 16-bit scope: single-image only (canvas document compositor is 2D canvas, inherently 8-bit)
- Float readback: `gl.FLOAT` + `Float32Array` (most compatible), convert to uint16 for TIFF
- Progress shape: `(progress: number) => void`, 0–1 range

## Validation
- `pnpm vitest run src/lib/export/tiff` — TIFF encoder tests
- `pnpm exec tsc --noEmit` — type check per slice
- Manual: export 16-bit TIFF, verify metadata; export multi-element canvas, observe progress
