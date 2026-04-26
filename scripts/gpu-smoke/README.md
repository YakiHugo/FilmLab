# GPU smoke harnesses

Browser-only smoke validators for the WebGPU rewrite (`src/lib/gpu/`). Not
codified into `package.json` — these are one-off manual checks tied to the
Slice validation gates in `docs/tasks/render-kernel-webgpu-rewrite.md`.

To run:

1. `pnpm dev:client`
2. Open the harness URL in Chrome 113+ / Edge 113+ / Safari 18.2+.

## Slice 0 — passthrough roundtrip

`scripts/gpu-smoke/passthrough.html`

Validation gate: upload source → passthrough → readback matches input within
1/255 per channel. The page logs PASS/FAIL inline.

URL: <http://localhost:5173/scripts/gpu-smoke/passthrough.html>
