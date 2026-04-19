# Agent Guidelines

## General

- Prefer the lightest process that preserves safety; do not turn optional tools or workflows into mandatory ceremony for low-risk changes.
- Be direct and objective. Push back when a proposal would worsen the code — e.g., introduces unrequested abstraction or dependencies, violates a rule in this file, reduces testability, forces re-reading prior context (breaks stateless extraction), or stacks another local patch on a known hotspot.
- Do not excessively use emojis.
- Inspect the relevant code before proposing changes. Decide small local details yourself; escalate only irreversible, security, architecture, or public-API boundary changes.
- When I ask for a change overview, explain the post-change overall architecture first. Cover every major affected file, its role in that architecture, and for any large, high-responsibility, or newly created component or module, include a concise description of its internal logic.
- Do what has been asked; nothing more, nothing less. Do not over-engineer.
- When modifying a module, search `docs/tasks` for related unfinished notes first; do not ignore existing task context and duplicate or conflict with in-flight work.
- When updating this file, keep rules short and dense: say when to do something and what anti-pattern to avoid, without extra narration.

## Code Convention

- Split a file or function only when the extracted piece can be understood and modified without reading back into the original; prefer stateless extractions. Keep functions under ~500 lines for AST-based retrieval.
- If a hotspot keeps regressing, prefer a structural refactor over more local patches.
- Keep shared helpers near their domain first; move them to `src/utils` only when they are stable, domain-neutral, and reused across boundaries.
- do not add aliases over `string`, primitives, or existing unions unless they add a real invariant or boundary.
- The project is not live yet; be aggressive about retiring historical-data compatibility instead of keeping dual paths by default.
- Use `try`/`catch` and similar control flow only for failures you expect and can handle; do not add unreachable recovery paths that hide bugs instead of failing fast during development.
- Write a brief comment only when a future agent needs to know why the code is written this way and that reason cannot be inferred from the code; do not narrate behavior, translate code into natural language, or restate responsibilities.
- When the project requires the use of newly added basic components, priority should be given to shadcn-related components.
## Long Tasks

- Treat a task as long when it cannot be completed safely in one session without explicit slicing.
- For long tasks, create paired `docs/tasks/<topic>.md` and `.json` files: markdown for scope, decisions, validation, and handoff; JSON for terse execution state only.
- Keep the JSON terse: stable task statuses such as `pending`, `in_progress`, `blocked`, `done`, `rolled_back`; `passes` as the completion gate; baseline/current task; rollback notes only when not obvious.
- The first session must at least slice the work and define validation boundaries; it may also complete the first slice if that slice is low-risk and fully validated.
- If a slice fails validation and is not fixed immediately, mark it `blocked` or `rolled_back`, record the first actionable failure in the markdown note, and stop claiming progress.
- When every slice reaches `done`, close the task: migrate load-bearing decisions and known follow-ups into `docs/decisions.md`, then delete the `docs/tasks/<topic>.{md,json}` pair. Slice-by-slice handoff is carried by git history, not by long-lived docs.

## Documentation Hygiene

- `docs/decisions.md` carries cross-task, long-lived decisions and deliberately-kept trade-offs with revisit triggers. `docs/tasks/*` holds only in-flight work.
- Do not write state assertions that rot on every commit: no "file is N lines", no "`pnpm test` passes today", no "function is at `foo.ts:123`". Agents verify state by running commands or grepping code.
- Reference code by stable anchor (`src/foo.ts::barFunction`, exported symbol name, module path) rather than by line number. If the anchor disappears, grep fails honestly.
- Before writing a new doc, check whether the information is derivable from code or `git log`. If yes, skip the doc.

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

## Subagents

- Use subagents for bounded exploration or parallel lookups when they materially reduce risk or context load; keep orchestration, implementation, integration, and test authoring in the main agent.
- Do not delegate work that is not already sliced cleanly — slice first, delegate second.

## Review

- Root rule: you cannot review your own fresh implementation. Every review runs in a new session or a subagent; the implementer is never the reviewer.
- Review is not required for typos, local renames, or comment-only edits. Everything else is reviewable.
- Performance review is a specialized pass, not routine. Trigger only for hot paths, render/IO pipelines, batched loops, or a concrete regression signal.
- Review scope is semantic/logical issues that require reasoning. Do not re-check anything `tsc`, linter, or the test suite already covers — those are verified by running them, not by review.
- The review checks violations of rules in this file: unreachable recovery, unrequested abstraction, alias over primitive without new invariant, behavior-narrating comments, dual compat paths kept after a migration, function/file over ~500 lines, hotspot stacked with another local patch, ignoring in-flight `docs/tasks` notes.
- It also checks: logic errors and broken invariants; wrong ordering or concurrency assumptions; boundary conditions (empty / extreme / re-entrant); regressions in adjacent behavior not covered by existing tests; missed reuse of existing helpers or domain modules; scope creep — the change doing more than asked; hidden shared mutable state that breaks stateless extraction.
- A finding is concrete only when it has all three: (1) location (`file:line` or identifiable region), (2) the issue stated against a named rule or a specific failure mode, (3) a proposed fix or an explicit tradeoff. "Seems off", "could be better", "might break edge cases" are not findings.
- If nothing concrete is found, say "no issues found". Do not pad.
- Classify each finding and present the list before applying anything:
  - real bug — will manifest as wrong behavior or a broken invariant. Default: fix.
  - rule violation — breaks a rule in this file even if no bug manifests. Default: fix.
  - nit — style preference, no bug, no rule violation. Default: do not fix unless asked or trivially cheap.
- Before committing an independent step, every real-bug and rule-violation finding must be resolved or explicitly accepted with a one-line reason.

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
