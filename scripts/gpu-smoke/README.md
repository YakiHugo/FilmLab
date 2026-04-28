# GPU smoke harnesses

Browser-only smoke validators for `src/lib/gpu/`. Not codified into
`package.json` — these are one-off manual checks. Per-slice harnesses with
WebGL2 reference paths were retired with the WebGL2 backend (no baseline to
diff against); only the two below remain.

To run:

1. `pnpm dev:client`
2. Open the harness URL in Chrome 113+ / Edge 113+ / Safari 18.2+.

## Slice 0 — passthrough roundtrip

`scripts/gpu-smoke/passthrough.html`

Validation gate: upload source → passthrough → readback matches input within
1/255 per channel. The page logs PASS/FAIL inline.

URL: <http://localhost:5173/scripts/gpu-smoke/passthrough.html>

## Slice 1 — ASCII compute pipeline

`scripts/gpu-smoke/ascii.html`

Validation gates (synthetic fixtures only — develop chain not required):

1. `structureWeight=0` on a density-step source: every band selects within ±1
   atlas slot of the closest-density glyph, with consistency across cells
   that share a band.
2. `structureWeight=1` on directional fixtures: vertical line → `|`,
   horizontal → `_`, up-right diagonal → `/`.
3. End-to-end timing at 1920×1080 cellSize=12 with full chain (analysis →
   selection → composition) completes in &lt;16 ms after warmup.

URL: <http://localhost:5173/scripts/gpu-smoke/ascii.html>
