# Test System Overhaul

## Scope

Fix the systemic reason the 2026-07 review found real bugs only in verification blind spots: tests are written by the same agent that writes the implementation, and test quality has no objective measure. Five slices live in the sibling JSON: `test-authoring-rules`, `mutation-testing-core`, `property-based-core-invariants`, `render-chain-golden-tests`, `persistence-contract-hardening`.

`review-remediation` slices reference task ids from this file in their `blockedBy`; the DAG is global across both task files.

## Decisions

- Four new rules go into `AGENTS.md` (Testing section): test/implementer separation for the render pipeline, server persistence, and the canvas document layer; task `passes` are frozen for the implementer; reviewers contribute at least one failing-scenario test for key fixes; mocks only at system boundaries. Each rule exists because a specific reviewed bug escaped exactly that gap.
- Mutation testing uses Stryker with the vitest runner, scoped to pure-function layers (canvas document, canvas geometry, `shared/`, gpu uniform resolvers). Thresholds are report-only first; gating comes after the baseline stabilizes, to avoid a noisy CI gate nobody trusts.
- Chain-level render correctness is verified in a real browser via vitest browser mode + playwright chromium with WebGPU (SwiftShader on CI). This is the only layer that can catch chain-composition bugs like the double sRGB decode; pass-level unit tests structurally cannot. Goldens first lock the *current* (known-wrong) output so the later decode fix is the only intended visual change.
- pg-mem keeps its partial-index drops (planner bug workaround), but the harness must re-add an equivalent uniqueness guard for the single-active-conversation invariant; the side effect of dropping unique constraints was previously undocumented.

## Handoff

- 2026-07-17: task pair created from the review plan. `test-authoring-rules` claimed.
- 2026-07-17: `test-authoring-rules` done. Four rules added to AGENTS.md Testing (separation, passes lock, adversarial test, mock discipline); Subagents rule updated to allow delegating behavior/adversarial tests to a non-implementer subagent. No code touched; nothing to run.
- 2026-07-17: `render-chain-golden-tests` claimed.
- 2026-07-17: `render-chain-golden-tests` done. vitest split into `unit`/`browser` projects (`pnpm test` unchanged in scope, `pnpm test:browser` for the browser suite); playwright chromium headless shell with `--use-webgpu-adapter=swiftshader` (works locally and on CI ubuntu). `src/render/image/renderChain.golden.browser.test.ts` renders the full `renderSingleImageToCanvas` chain with zero gpu mocks: two default-chain goldens, one `stock-portra-400` LUT-chain golden (a v1 id was tried first — `film-neutral-v1` resolves to a fully neutral profile, which exposed the v1 conversion trap recorded in review-remediation's knip backlog), plus the midtone probe marked `it.fails` as the reproduction test for `decode-double-srgb-fix` (remove `.fails` when that fix lands). Goldens regenerate when deleted (first run fails by design). CI gained a `browser-test` job gating `build`; `__screenshots__/` gitignored. Validation: `pnpm test:browser` 3 passed + 1 expected fail; `pnpm verify` pass.
