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
