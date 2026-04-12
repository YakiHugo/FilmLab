# ASCII Magic Visual Parity

## Goal

Align the Canvas2D ASCII renderer with ascii-magic.com's output quality. The renderer works but the visual result is noticeably worse.

## Context

The GPU carrier pipeline (filterPipeline + captureLinearSource) had unfixable state-mutation bugs, so ASCII rendering was moved to Canvas2D. The Canvas2D path is correct but missing several features that affect quality.

## Current architecture

`asciiEffect.ts` → `renderAsciiToCanvas()`:
1. Downsample source to grid via `drawImage` → `getImageData`
2. Build per-cell luminance grid
3. Draw background (blurred-source / solid) on top of existing canvas
4. Per-cell loop: compute brightness → edge emphasis → coverage → tone → glyph selection → fillText

## Gaps (priority order)

### Slice 1: Floyd-Steinberg dithering
- `normalized.dither` is parsed but never used in the Canvas2D renderer
- Without dithering, tone-to-glyph quantization creates visible banding
- Implement: after computing toneByCell grid, apply Floyd-Steinberg error diffusion before glyph selection
- Validation: compare smooth-gradient image output with/without dither

### Slice 2: Cell-solid background mode
- `backgroundMode === "cell-solid"` is accepted but not rendered
- Should draw a solid-color rect per visible cell BEHIND the character
- Low risk: only affects non-default mode

### Slice 3: Glyph rendering quality at small cell sizes
- At cellSize=8, fillText uses 7px font — Canvas2D anti-aliasing is poor
- Pre-render each unique glyph at high resolution (40px+) on an offscreen canvas
- Per-cell: drawImage from the atlas with the cell's fillStyle as tint
- Challenge: Canvas2D can't tint a pre-rendered image per-cell without compositing tricks (need destination-in or globalCompositeOperation sequence)
- Alternative: accept fillText quality but explore `ctx.imageSmoothingQuality = "high"` and font hints

### Slice 4: Background blur quality
- CSS `filter: blur()` is browser-dependent and may not match ascii-magic's Gaussian
- Consider: pre-blur source onto offscreen canvas with multiple-pass box blur for consistent results
- Lower priority since CSS blur is "good enough" for most cases

## Validation

- Visual comparison against ascii-magic.com with same source image
- Test with: gradient image (dither banding), high-contrast portrait (edge emphasis), low-key photo (coverage clipping)
- `pnpm build` must pass
