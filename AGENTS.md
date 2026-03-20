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

## Testing

- Keep implementation context and test-writing context isolated. Never write implementation code and test files in the same agent-visible context.
- When tests are needed, delegate test authoring to a dedicated subagent with isolated context.
- The inverse is also acceptable: one isolated subagent may implement while another isolated subagent writes tests, but no single context may see and edit both.
- Only write unit tests for pure functions.
- Treat pure functions strictly: deterministic input/output logic with no I/O, shared mutable state, framework lifecycle, network, storage, timer, or rendering side effects.
- Do not add unit tests for components, hooks, stores, routes, integration flows, or any side-effectful or non-pure module.
- Do not expand existing nonconforming tests. They may be deleted when touched or when cleanup is requested.

## Subagents

- When the user or the main agent judges a task too large, split it into modules and delegate implementation to subagents.
- The main agent owns the orchestration: define module boundaries, manage sequencing, track dependency impact, and integrate the result.
- Delegate with clear ownership so subagents do not work on overlapping modules or incompatible assumptions.
- Account for cross-module dependencies before delegation. Do not split work blindly when interface or integration risk is high.
- If dependency relationships are too complex to split safely, stop and ask the user to help decompose the task instead of guessing.

## Code Review

- Only flag concrete issues. Do not nitpick style, hypothetical edge cases that cannot happen, or "improvements" that change nothing meaningful.
- If a review finds nothing wrong, say "no issues found". Do not invent problems to appear thorough.
- After implementation and any relevant tests, dispatch a dedicated architecture review subagent.
- Dispatch a dedicated performance review subagent.
- Dispatch a dedicated code bug and missing functionality review subagent.
- The main agent remains responsible for dispatching those review passes, consolidating findings, resolving conflicts, and deciding the final changes.

## Using GitHub

- Never mention Claude Code in PR descriptions, PR comments, or issue comments.
- Use the gh tool for GitHub-related operations.
- Atomic development: when executing a multi-step plan, commit after each independent step completes (with tests passing). Do not accumulate all
  changes into one final commit.
