# Render Baseline

Generated: 2026-02-24T12:21:53.537Z

## Asset Manifest

| File | Size |
| --- | ---: |
| `R.jpeg` | 124.9 KB |
| `unsplash_4c7lecfas1M.jpg` | 81.6 KB |
| `unsplash_6z0Viul75Tg.jpg` | 293.3 KB |
| `unsplash_e3-Gw5ig2A8.jpg` | 70.5 KB |
| `unsplash_esZffT2hurY.jpg` | 210.4 KB |
| `unsplash_F-B7kWlkxDQ.jpg` | 109.0 KB |
| `unsplash_PhciG8fpRKw.jpg` | 43.1 KB |
| `unsplash_PVhiLxBe22M.jpg` | 159.5 KB |
| `unsplash_rPCAP-4bO-M.jpg` | 137.9 KB |
| `unsplash_uoHwIZx_HLo.jpg` | 148.0 KB |
| `unsplash_uQtRtfFF4Qk.jpg` | 53.8 KB |
| **Total (11 files)** | **1.40 MB** |

## Benchmark Procedure

1. Run `pnpm dev`, open the app, and load assets from `test-assets/images/`.
2. Enable timing logs in DevTools:
   - `localStorage.setItem("filmlab:renderTiming", "1")`
   - optional: `localStorage.setItem("filmlab:renderTimingVerbose", "1")`
3. Reload and perform fixed interaction scripts:
   - 10s exposure drag, 10s WB drag, 10s clarity drag.
   - repeat for preview and export scenarios.
4. Capture console timing logs and compute P50/P95 by mode.

## Notes

- Runtime flags can be forced via `filmlab:feature:*` keys for rollback tests.
- Export concurrency baseline can be pinned via `filmlab:exportConcurrency`.

