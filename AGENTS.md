# Agent Guidelines

## General

- Prefer the lightest process that preserves safety; do not turn optional tools or workflows into mandatory ceremony for low-risk changes.
- Be direct and objective. Push back when a proposal would worsen the code.
- Do not excessively use emojis.
- Inspect the relevant code before proposing changes. Decide small local details yourself; escalate only irreversible, security, architecture, or public-API boundary changes.
- When I ask for a change overview, explain the post-change overall architecture first. Cover every major affected file, its role in that architecture, and for any large, high-responsibility, or newly created component or module, include a concise description of its internal logic.
- Do what has been asked; nothing more, nothing less. Do not over-engineer.
- When modifying a module, search `docs/tasks` for related unfinished notes first; do not ignore existing task context and duplicate or conflict with in-flight work.
- When updating this file, keep rules short and dense: say when to do something and what anti-pattern to avoid, without extra narration.

## Code Convention

- Split code when responsibilities or side-effect ownership are unclear;
- if a hotspot keeps regressing, prefer a structural refactor over more local patches.
- Keep shared helpers near their domain first; move them to `src/utils` only when they are stable, domain-neutral, and reused across boundaries.
- do not add aliases over `string`, primitives, or existing unions unless they add a real invariant or boundary.

## Long Tasks

- Treat a task as long when it cannot be completed safely in one session without explicit slicing.
- For long tasks, create paired `docs/tasks/<topic>.md` and `.json` files: markdown for scope, decisions, validation, and handoff; JSON for terse execution state only.
- Keep the JSON terse: stable task statuses such as `pending`, `in_progress`, `blocked`, `done`, `rolled_back`; `passes` as the completion gate; baseline/current task; rollback notes only when not obvious.
- The first session must at least slice the work and define validation boundaries; it may also complete the first slice if that slice is low-risk and fully validated.
- If a slice fails validation and is not fixed immediately, mark it `blocked` or `rolled_back`, record the first actionable failure in the markdown note, and stop claiming progress.

## Compact Instructions

1. Architecture decisions. Do not summarize away the decision, rationale, boundary, or chosen tradeoff.
2. Modified files and critical changes. Keep an explicit file list and the key change in each file.
3. Validation state. Record pass or fail per relevant command.
4. Unresolved TODOs and rollback notes. Keep them explicit.
5. Tool output. Reduce it to pass or fail plus the first actionable error unless the full raw output is needed for debugging.

## Testing

- Finish implementation before adding tests unless a characterization test is needed to lock existing behavior before a risky refactor.
- Choose the narrowest test level that matches the behavior: unit tests for pure functions, integration or route/component tests for side-effectful behavior, and smoke/E2E checks for user flows.
- Do not add or expand tests that mainly mirror implementation details instead of protecting behavior.
- For browser-based validation of local UI flows, use `agent-browser` for interactive smoke tests and lightweight end-to-end functional checks. Do not use it as the default tool for extracting or reading page content.
- Only codify an `agent-browser` flow under `scripts/` and `package.json` when it is stable and expected to be rerun regularly; otherwise a one-off manual smoke pass is enough.
- When replacing fragile logic, prefer behavior-preserving coverage or explicit validation notes before broad refactors.

## Review And Subagents

- Use subagents for bounded exploration or review when they materially reduce risk; keep orchestration, implementation, integration, and test authoring in the main agent unless the work is already sliced cleanly.
- Choose the minimum review surface that matches the change. Architecture, bug/regression, and performance reviews are conditional, not mandatory ceremony.
- Default to a skeptical review posture: actively look for likely bugs, regressions, invalid assumptions, and missing validation before concluding "no issues found".
- Review findings must be concrete. If no concrete issues are found, say "no issues found".
- Before committing an independent step, resolve or explicitly accept findings from any review passes that were chosen for that step.

## Using GitHub

- Never mention Claude Code in PR descriptions, PR comments, or issue comments.
- Use the gh tool for GitHub-related operations.
- When commits are requested, keep them atomic: commit each validated independent step rather than bundling unrelated changes.

## Commit & Pull Request Guidelines

Follow Conventional Commit style: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf: ...`. Keep scopes specific (e.g., `renderer`, `library`, `editor`, `canvas`, `chat`, `ai`, `router`). For PRs, include:

- clear summary and rationale
- linked issue/task
- test evidence (`pnpm test`, `pnpm lint`, `pnpm build`)
- screenshots or short recordings for UI changes
