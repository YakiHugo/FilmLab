# Render Validation Checklist

## Asset Set

Use the fixed sample set under `test-assets/images/`:

- `R.jpeg`
- `unsplash_4c7lecfas1M.jpg`
- `unsplash_6z0Viul75Tg.jpg`
- `unsplash_e3-Gw5ig2A8.jpg`
- `unsplash_esZffT2hurY.jpg`
- `unsplash_F-B7kWlkxDQ.jpg`
- `unsplash_PhciG8fpRKw.jpg`
- `unsplash_PVhiLxBe22M.jpg`
- `unsplash_rPCAP-4bO-M.jpg`
- `unsplash_uoHwIZx_HLo.jpg`
- `unsplash_uQtRtfFF4Qk.jpg`

## Manual Visual Validation

1. Run `pnpm dev` and open the app.
2. Load assets from `test-assets/images/`.
3. Validate preview interactions on a fixed image:
   - 10s exposure drag
   - 10s white-balance drag
   - 10s clarity drag
   - 10s crop translate drag in Crop mode
   - 10s brush mask painting in Mask mode
4. Validate export on the same image after each interaction flow.
5. Compare preview and export visually for:
   - stage ordering parity
   - no missing overlays or masked effects
   - no geometry drift after crop/rotate operations
   - no obvious fallback-only artifacts

## Visual Gates

- Crop drag should remain visually continuous without obvious jump-back frames.
- Brush painting should keep the mask-aligned effect anchored to the painted region.
- Preview and export should agree on geometry, overlay placement, and final effect order.
- Renderer failures should degrade to a usable preview rather than a blank frame.

## Notes

- Agent-oriented debugging should use structured render trace data and output hashes from the render APIs.
- There is no packaged CLI trace/hash capture flow; collect agent-oriented diagnostics through focused tests or direct render API calls.
- Visual review remains the final check for perceptual quality, not the primary debugging workflow.
