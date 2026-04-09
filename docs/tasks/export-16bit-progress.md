# 16-bit TIFF Export + Export Progress Feedback

## Scope

Add 16-bit TIFF export path (single-image only) and progress callback for canvas document export.

## Slices

### Slice 1: 16-bit TIFF encoder — done
- `src/lib/export/tiff.ts` — `encodeFloat32RgbaToTiff16()` 

### Slice 2: Float readback from GPU — done
- `src/lib/renderer/PipelineRenderer.ts` — `extractLinearPixelsFloat32()`

### Slice 3: Export progress callback — done
- `src/features/canvas/renderCanvasDocument.ts` — `onProgress` in element loop
- `src/features/canvas/hooks/useCanvasExport.ts` — thread callback
- `src/features/canvas/CanvasExportDialog.tsx` — progress bar UI

### Slice 4: TIFF format in export UI — done (8-bit only)
- TIFF option added to format selector
- Encoding via `getImageData` → `encodeRgbaToTiff`

### Slice 5: Wire 16-bit path end-to-end — pending
Infra is ready (`encodeFloat32RgbaToTiff16` + `extractLinearPixelsFloat32`) but not connected to the export UI. Requires:
- Single-image export path calls `render({captureLinearOutput: true})`
- After render, call `extractLinearPixelsFloat32()` before renderer is reused
- Encode with `encodeFloat32RgbaToTiff16()` and download as blob
- Add "16-bit" toggle in CanvasExportDialog (only when TIFF + single-image workbench)
- Depends on export UI design decisions not yet made

## Decisions
- 16-bit scope: single-image only (canvas document compositor is 2D canvas, inherently 8-bit)
- Float readback: `gl.FLOAT` + `Float32Array` (most compatible), convert to uint16 for TIFF
- Progress shape: `(progress: number) => void`, 0–1 range

## Validation
- `pnpm vitest run src/lib/export/tiff` — TIFF encoder tests
- `pnpm exec tsc --noEmit` — type check per slice
- Manual: export 16-bit TIFF, verify metadata; export multi-element canvas, observe progress
