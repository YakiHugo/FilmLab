# Agent Guidelines

## Commit & Pull Request Guidelines

Follow Conventional Commit style: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf: ...`. Keep scopes specific (e.g., `renderer`, `library`, `editor`, `canvas`, `chat`, `ai`, `router`). For PRs, include:

- clear summary and rationale
- linked issue/task
- test evidence (`pnpm test`, `pnpm lint`, `pnpm build`)
- screenshots or short recordings for UI changes

## General

- Do not tell me I am right all the time. Be critical. We are equals. Stay neutral and objective.
- Never be sycophantic. If you disagree, say so directly. If my suggestion would make the code worse, push back.
- Do not excessively use emojis.
- Always read and understand code before proposing changes. Never suggest modifications to code you have not inspected.
- Do what has been asked; nothing more, nothing less. Do not over-engineer.
- For small decisions (naming, local refactors, implementation details), decide on your own and move on. Only ask when the choice is irreversible or affects security/architecture.
- When refactoring or creating new module, first propose what you consider best practice and let the user decide, rather than immediately compromising the workspace code
- Prefer shared helpers in `src/utils/<function>.ts`, with re-exports from `src/utils/index.ts`.
- Do not inline runtime ID generation with `randomUUID`, `Date.now`, or `Math.random`; reuse the shared ID helper instead.
- For canvas insert, duplicate, delete, and upsert flows, reuse the shared collision and selection handling instead of re-implementing ad hoc logic at new call sites.

## Stateful Modules

- When a module mixes session state, async persistence, UI ownership, and cross-context transitions, treat it as a state machine, not a local patching task.
- Before changing that kind of module, write down the key invariants and the few critical transition sequences that must stay valid.
- If a second review round finds new issues in the same stateful area or root cause cluster, stop doing narrow patch-on-patch fixes and switch to a more holistic seam or state-transition refactor.
- Before asking for final review on a stateful module, explicitly sanity-check the risky transition paths locally.

## Testing

- Keep implementation work and test-writing work logically separate. If both are needed, finish implementation first and write tests as a separate step.
- Do not use subagents for implementation or test authoring. Subagents are reserved for review and explore only.
- Only write unit tests for pure functions.
- Treat pure functions strictly: deterministic input/output logic with no I/O, shared mutable state, framework lifecycle, network, storage, timer, or rendering side effects.
- Do not add unit tests for components, hooks, stores, routes, integration flows, or any side-effectful or non-pure module.
- Do not expand existing nonconforming tests. They may be deleted when touched or when cleanup is requested.
- For browser-based validation of local UI flows, `agent-browser` is recommended for interactive smoke checks because it is quick to iterate with and easier to replay than an ad hoc CDP session.
- Do not treat `agent-browser` as a blanket replacement for CDP/Chrome DevTools. Use whichever tool best matches the interaction or diagnostics you need.
- Only codify an `agent-browser` flow under `scripts/` and `package.json` when it is stable and expected to be rerun regularly; otherwise a one-off manual smoke pass is enough.

## Subagents

- Use subagents only for review and explore tasks.
- Do not use subagents for implementation, refactoring, test authoring, orchestration, or integration work.
- Explore subagents should answer bounded codebase questions or gather context only.
- Review subagents may be used for architecture, performance, and bug or missing-functionality review passes.
- Default to the minimum review surface that matches the change. For complex logic changes, usually start with architecture plus bug/regression; add performance only when hot paths or render/update frequency changed.
- If a task is too large or too coupled to split safely, do not delegate delivery work to subagents; ask the user to narrow scope or help decompose it instead.
- In review prompts, state any accepted current behaviors and out-of-scope interactions explicitly so subagents do not keep re-reporting them.

## Code Review

- Only flag concrete issues. Do not nitpick style, hypothetical edge cases that cannot happen, or "improvements" that change nothing meaningful.
- If a review finds nothing wrong, say "no issues found". Do not invent problems to appear thorough.
- After implementation and any relevant tests pass, the main agent must decide how many review subagents to run, and which types to run, based on the scope of the current changes and the results of the previous review round.
- Dispatch architecture, performance, and bug or missing-functionality review subagents only when that area could be affected by the current changes, or when a previous review in that area found issues that still need revalidation.
- If a review area is clearly unaffected by the current changes and the last pass for that area found no issues, do not rerun that subagent.
- If repeated review findings are symptoms of the same root cause, consolidate them and treat them as one problem to fix, not as an excuse to keep cycling shallow review passes.
- If review keeps surfacing new issues in the same file or state transition logic, prefer one deeper holistic re-review after the structural fix instead of many narrow reruns.
- Do not commit an independent module or step until the review subagent passes selected for that step have finished and their findings have been resolved or explicitly accepted.
- The main agent remains responsible for dispatching those review passes, consolidating findings, resolving conflicts, and deciding the final changes.

## Using GitHub

- Never mention Claude Code in PR descriptions, PR comments, or issue comments.
- Use the gh tool for GitHub-related operations.
- Atomic development: when executing a multi-step plan, commit after each independent step completes only after relevant tests pass and the required review subagent passes are complete. Do not accumulate all
  changes into one final commit.
