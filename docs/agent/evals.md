# FilmLab Prompt Pipeline Evals

This document defines the minimum harness for prompt rewrite, compiler, router, fallback, and observability changes.

## Why This Exists

Prompt pipeline regressions are easy to miss because a route can still return an image while silently changing:

- semantic loss behavior
- fallback routing
- exact retry semantics
- requested versus executed target snapshots
- observability summaries

For this area, real failures must become regression tests quickly.

## Rule: First Real Failure Becomes A Test

If prompt rewrite, compiler, router, or prompt observability produces a real bug, convert that failure into a test before moving on.

Preferred order:

1. Reproduce with the smallest failing fixture.
2. Add or update a test near the owning subsystem.
3. Fix the bug.
4. Keep the regression in the suite.

## Coverage Expectations

`pnpm verify:prompt` must cover these behaviors:

- rewrite deterministic fallback versus successful rewrite
- compiler semantic loss emission and stable hashes
- degraded edit and variation flows
- exact retry reusing prior artifacts instead of recompiling
- fallback dispatch changing executed target while preserving requested and selected target meaning
- prompt observability aggregation for degraded and fallback turns

## Test Placement

- `server/src/gateway/prompt/*.test.ts` for rewrite, prompt IR, compiler, and semantic-loss behavior
- `server/src/gateway/router/*.test.ts` for target selection and retry policy
- `server/src/routes/*.test.ts` for route-level persistence, exact retry, fallback, and response shape
- `server/src/chat/persistence/*.test.ts` for prompt artifact and observability summaries

## Fixture Design

- Keep fixtures explicit and small.
- Prefer deterministic fixtures over broad mocks.
- Assert the specific invariant that must not regress.
- When fallback is under test, assert target order and target identity, not only success.

## Verification Commands

- Use `pnpm verify:prompt` for prompt-pipeline-focused iteration.
- Use `pnpm verify` as the final gate.

Do not ship prompt pipeline changes that only pass manually or only look correct in the UI.
