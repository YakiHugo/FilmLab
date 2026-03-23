# FilmLab Agent Rules

This file carries detailed repository rules that are too specific or too long for `AGENTS.md`.

## Collaboration

- Be neutral and direct. Push back when a suggestion would make the code worse.
- Read the relevant code before proposing changes.
- Do what was asked; do not expand scope without a concrete reason.
- For small local decisions, decide and move on. Ask only when the choice is hard to reverse or affects architecture or security.
- When refactoring or creating a new module, state the best-practice direction first instead of silently locking in a compromise.

## Facts, Docs, And Scratch Material

- `docs/agent/*` is the durable agent-facing documentation surface.
- `refs/` may contain useful context or handoff notes, but it is not a source of truth.
- If a rule or invariant matters repeatedly, encode it in lint, tests, or CI instead of relying on documentation alone.

## Shared Helpers

- Prefer shared helpers in `src/utils/<function>.ts` for frontend use, with re-exports from `src/utils/index.ts`.
- For code shared by frontend and server, prefer `shared/*.ts`.
- Do not inline runtime entity ID generation with `randomUUID`, `Date.now`, or `Math.random`; reuse the shared ID helper.

## Canvas Rules

- For canvas insert, duplicate, delete, and upsert flows, reuse shared collision and selection handling.
- Do not re-implement ad hoc collision or selection logic at new call sites.

## Stateful Modules

Treat a module as stateful when it mixes session state, persistence, UI ownership, and cross-context transitions.

Before changing a stateful module:

- Write down the invariants that must remain true.
- Identify the critical transition sequences that can regress.
- Prefer a seam or state-transition refactor over patch-on-patch fixes when the same root cause keeps resurfacing.

Before final review on a stateful module:

- Sanity-check the risky transition paths locally.

## Testing

- Keep implementation work and test writing as separate steps.
- Only write unit tests for pure functions.
- Treat pure functions strictly: deterministic input/output only, with no I/O, framework lifecycle, timers, network, storage, rendering, or shared mutable state.
- Do not add or expand unit tests for components, hooks, stores, routes, or other side-effectful modules unless the user explicitly asks for that cleanup.
- For browser-based validation of local UI flows, `agent-browser` is recommended for interactive smoke checks because it is quick to iterate with and easier to replay than an ad hoc CDP session.
- Do not treat `agent-browser` as a blanket replacement for CDP or Chrome DevTools. Use whichever tool best matches the interaction or diagnostics you need.
- Only codify an `agent-browser` flow under `scripts/` and `package.json` when it is stable and expected to be rerun regularly; otherwise a one-off smoke pass is enough.

## Subagents

- Use subagents only for bounded explore and review tasks.
- Do not use subagents for implementation, refactoring, orchestration, or test authoring.
- Review passes should stay scoped to the areas plausibly affected by the change.

## Code Review

- Only flag concrete issues.
- Do not nitpick style or invent speculative failures.
- If a review finds nothing, say `no issues found`.
- If repeated findings stem from one root cause, fix the root cause instead of cycling shallow patches.

## Validation

- Run the smallest relevant checks while iterating.
- Finish with `pnpm verify`.
- For prompt rewrite, compiler, router, fallback, prompt artifacts, or observability changes, also run `pnpm verify:prompt`.

## Git And PRs

- Follow Conventional Commits such as `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf: ...`.
- Keep scopes specific, for example `renderer`, `library`, `editor`, `canvas`, `chat`, `ai`, `router`.
- Use `gh` for GitHub operations.
- Do not mention Claude Code in PR descriptions, PR comments, or issue comments.
- For multi-step work, keep commits atomic after relevant verification and review passes.
