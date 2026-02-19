# FilmLab Editor Histogram Module Guide

> Last updated: 2026-02-20  
> Scope: `src/pages/editor/histogram.ts`, `EditorPreviewCard`, `EditorHistogram`, sidebar label/state flow  
> Audience: maintainers, reviewers, future agents, and contributors iterating histogram behavior

## 1. Module Purpose

Histogram module provides a real-time tonal distribution view for the Editor preview.

Primary goals:

1. Keep histogram responsive during editing.
2. Preserve RGB semantics for color photos.
3. Match Lightroom-style presentation for monochrome photos by using neutral-gray overlap display.
4. Keep logic local to editor page and avoid renderer pipeline coupling.

Out of scope:

1. Rendering pipeline math (Pixi/WebGL/CPU color transform internals).
2. Persisting histogram data to IndexedDB.
3. Export-time histogram rendering.

## 2. User-Facing Behavior Contract

Current UI contract:

1. No selected asset: show `暂无直方图`.
2. Selected asset:
   1. Mode `rgb`: show red/green/blue filled curves.
   2. Mode `rgb-monochrome-overlap`: show one neutral-gray overlap curve derived from `luma`.
3. Badge text:
   1. `直方图：RGB` for `rgb`.
   2. `直方图：RGB（灰度重叠）` for `rgb-monochrome-overlap`.
4. `showOriginal` controls source:
   1. `true`: histogram from original image.
   2. `false`: histogram from rendered preview canvas.

Lightroom-alignment rule (important):

1. If original source image is detected monochrome, histogram display mode is forced to neutral-gray overlap even in adjusted preview.

## 3. Source Map and Responsibilities

1. `src/pages/editor/histogram.ts`
   1. Histogram types.
   2. Histogram computation.
   3. Monochrome detection.
   4. Forced monochrome mode helper.
2. `src/pages/editor/EditorPreviewCard.tsx`
   1. Builds histogram from original or rendered canvas.
   2. Detects source monochrome state per asset.
   3. Applies force-mode override for monochrome originals.
3. `src/pages/editor/EditorHistogram.tsx`
   1. Converts bins to SVG paths.
   2. Branches rendering by histogram mode.
4. `src/pages/editor/EditorSidebarHeader.tsx`
   1. Reads `previewHistogram` from store.
   2. Renders dynamic mode label badge.
5. `src/stores/editorStore.ts`
   1. Holds `previewHistogram: HistogramData | null`.
6. `src/pages/editor/useEditorState.ts`
   1. Wraps `setPreviewHistogram` via `handlePreviewHistogramChange`.
7. `src/pages/editor/histogram.test.ts`
   1. Unit tests for detection, normalization, and force-mode helper.

## 4. Data Contract

`HistogramData`:

1. `r: number[]` size 64, normalized [0, 1].
2. `g: number[]` size 64, normalized [0, 1].
3. `b: number[]` size 64, normalized [0, 1].
4. `luma: number[]` size 64, normalized [0, 1].
5. `mode: "rgb" | "rgb-monochrome-overlap"`.
6. `analysis`:
   1. `isMonochrome: boolean`
   2. `sampleCount: number`
   3. `meanChannelDelta: number`
   4. `p95ChannelDelta: number`

Invariant notes:

1. Bin arrays always length 64.
2. All bins are normalized by a shared max value across `r/g/b/luma`.
3. `mode` is the render contract used by UI, not a persistence field.
4. `analysis` is debug-friendly runtime metadata and can be used for threshold tuning.

## 5. Computation Design

## 5.1 Sampling and downscale path

Entry functions:

1. `buildHistogramFromDrawable(source, sourceWidth, sourceHeight, sampleWidth=240)`
2. `buildHistogramFromCanvas(canvas, sampleWidth=240)`

Process:

1. Downscale source to width 240 while preserving aspect ratio.
2. Draw to temporary canvas.
3. Read `ImageData`.
4. Compute histogram from RGBA byte array.

Rationale:

1. Fixed sample width keeps runtime stable on large images.
2. Histogram is for UI feedback, not pixel-perfect analysis.

## 5.2 Core per-sample loop

Constants:

1. `HISTOGRAM_BINS = 64`
2. `SAMPLE_STRIDE = 16` bytes
3. `TRANSPARENT_ALPHA_THRESHOLD = 8`

Loop behavior:

1. Iterate `Uint8ClampedArray` by byte stride 16.
2. This effectively samples every 4th pixel because RGBA uses 4 bytes per pixel.
3. Skip sample when alpha <= 8.
4. Update `r/g/b/luma` bins.
5. Accumulate channel delta stats:
   1. per-sample `delta = max(r,g,b) - min(r,g,b)`.
   2. track total for mean.
   3. track histogram distribution (0..255) for percentile.

## 5.3 Normalization

1. Find one global max across all 64 bins in `r/g/b/luma`.
2. Normalize each channel by this max.
3. Empty-sample fallback:
   1. if `sampleCount=0`, return zero bins, `mode="rgb"`, empty analysis.

## 5.4 Monochrome detection

Strict pixel-delta rule:

1. `p95ChannelDelta <= 8`
2. `meanChannelDelta <= 5`

Histogram-overlap fallback rule:

1. Compare normalized channel pairs (`r-g`, `r-b`, `g-b`).
2. For each pair, compute:
   1. `l1` sum of abs deltas across 64 bins.
   2. `maxAbs` max abs delta across 64 bins.
3. Use worst pair metrics:
   1. `maxAbsBinDelta <= 0.04`
   2. `maxL1BinDelta <= 0.75`

Final detection:

1. `isMonochrome = strictRule || overlapRule`
2. `mode = isMonochrome ? "rgb-monochrome-overlap" : "rgb"`

Why two rules:

1. Strict rule catches clean grayscale.
2. Overlap rule recovers near-monochrome outputs with channel noise/compression/render artifacts.

## 5.5 Forced mode helper

`forceMonochromeHistogramMode(histogram)`:

1. If input is null, return null.
2. If already monochrome-overlap mode, return as-is.
3. Else clone with:
   1. `mode="rgb-monochrome-overlap"`
   2. `analysis.isMonochrome=true`

This helper changes display contract only, not bins.

## 6. Runtime Data Flow in Editor

## 6.1 State location

1. Store field: `previewHistogram` in `editorStore`.
2. Write path: `useEditorState.handlePreviewHistogramChange`.
3. Read path: `EditorSidebarHeader -> EditorHistogram`.

## 6.2 Effect flow in `EditorPreviewCard`

Effect A: source monochrome detection

1. Trigger: `selectedAsset?.id` or `selectedAsset?.objectUrl` change.
2. Decode original image.
3. Build histogram from source image.
4. Set local `isSourceMonochrome`.

Effect B: original-mode histogram (`showOriginal=true`)

1. Trigger: selected asset or `showOriginal` change.
2. Build histogram from original image.
3. Update `isSourceMonochrome` from source histogram analysis.
4. If source monochrome, force monochrome display mode before pushing to store.

Effect C: adjusted-preview histogram (`showOriginal=false`)

1. Render adjusted preview to canvas via `renderImageToCanvas`.
2. Build histogram from canvas.
3. If `isSourceMonochrome=true`, force monochrome display mode.
4. Push result to store.

Design consequence:

1. Monochrome original photos remain neutral-gray histogram in both original and adjusted views.
2. Color originals still rely on result histogram detection in adjusted view.

## 7. Rendering Design

`EditorHistogram` path generation:

1. Convert bins to line path with x in [0,100], y in [0,100].
2. Build area path by closing to baseline.

Render branch:

1. `rgb`:
   1. area fills:
      1. red `rgba(248,113,113,0.25)`
      2. green `rgba(52,211,153,0.25)`
      3. blue `rgba(96,165,250,0.25)`
   2. line colors:
      1. `#f87171`
      2. `#34d399`
      3. `#60a5fa`
2. `rgb-monochrome-overlap`:
   1. area fill: `rgba(203,213,225,0.28)`
   2. line color: `#cbd5e1`

Accessibility:

1. SVG role is `img`.
2. `aria-label="直方图"`.

## 8. Decision Record and Tradeoffs

Decision 1: keep RGB model instead of replacing with luma-only model globally.

1. Pros: preserves color analysis for normal photos.
2. Cons: requires mode switch logic and additional metadata.

Decision 2: source-aware override for monochrome originals.

1. Pros: stable Lightroom-like BW presentation after editing.
2. Cons: if user intentionally colorizes a monochrome original, display remains gray-overlap unless logic is changed.

Decision 3: heuristic thresholds instead of explicit profile tags.

1. Pros: works for imported files regardless of preset/film tag.
2. Cons: thresholds may require dataset-specific tuning.

## 9. Test Coverage

`src/pages/editor/histogram.test.ts` currently covers:

1. Pure grayscale gradient detection.
2. Light per-channel noise grayscale detection.
3. Medium per-channel noise grayscale detection.
4. Low-saturation color detection stays RGB.
5. High-saturation color detection stays RGB.
6. Fully transparent input fallback.
7. Normalization range and max bin behavior.
8. `forceMonochromeHistogramMode` behavior.

Gaps not yet automated:

1. React integration tests for `showOriginal` toggling and label transitions.
2. End-to-end behavior with real renderer outputs and presets.
3. Performance regression tests for rapid slider drags.

## 10. Known Limitations

1. No persisted histogram cache per asset; recompute is runtime-only.
2. Sampling is heuristic and can diverge from full-resolution distribution.
3. Forced monochrome mode for monochrome originals may not reflect intentional colorized edits.
4. Mode determination for color originals under stylized filters is still heuristic.

## 11. Debugging Playbook

When histogram behavior looks wrong:

1. Confirm current preview source:
   1. `showOriginal=true` means source image path.
   2. `showOriginal=false` means rendered canvas path.
2. Inspect `previewHistogram.analysis` to verify:
   1. `sampleCount`
   2. `meanChannelDelta`
   3. `p95ChannelDelta`
3. Confirm source lock:
   1. check whether `isSourceMonochrome` should be true for that asset.
4. Check mode label in sidebar:
   1. `直方图：RGB` vs `直方图：RGB（灰度重叠）`.
5. If thresholds seem too strict/loose:
   1. tune constants in `src/pages/editor/histogram.ts`.
   2. add/update unit tests before merging.

## 12. Safe Iteration Checklist

When changing histogram behavior, update all of:

1. `src/pages/editor/histogram.ts` for computation/type/threshold logic.
2. `src/pages/editor/EditorHistogram.tsx` if render contract changes.
3. `src/pages/editor/EditorPreviewCard.tsx` if source/preview flow changes.
4. `src/pages/editor/EditorSidebarHeader.tsx` if mode label semantics change.
5. `src/pages/editor/histogram.test.ts` for regression coverage.
6. `docs/editor.md` and this file for behavior documentation.

Validation before merge:

1. `pnpm vitest src/pages/editor/histogram.test.ts`
2. `pnpm build`
3. Manual check:
   1. monochrome original
   2. color original
   3. original/adjusted toggle
   4. slider drag responsiveness

## 13. Future Extensions (Optional)

1. Add explicit histogram debug overlay in dev mode to show analysis values.
2. Add integration tests around `showOriginal` transitions.
3. Add optional behavior switch:
   1. lock-to-source monochrome (current)
   2. derive-from-current-preview only
4. Tune thresholds using a curated photo corpus and benchmark script.
