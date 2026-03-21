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

- Keep implementation work and test-writing work logically separate. If both are needed, finish implementation first and write tests as a separate step.
- Do not use subagents for implementation or test authoring. Subagents are reserved for review and explore only.
- Only write unit tests for pure functions.
- Treat pure functions strictly: deterministic input/output logic with no I/O, shared mutable state, framework lifecycle, network, storage, timer, or rendering side effects.
- Do not add unit tests for components, hooks, stores, routes, integration flows, or any side-effectful or non-pure module.
- Do not expand existing nonconforming tests. They may be deleted when touched or when cleanup is requested.

## Subagents

- Use subagents only for review and explore tasks.
- Do not use subagents for implementation, refactoring, test authoring, orchestration, or integration work.
- Explore subagents should answer bounded codebase questions or gather context only.
- Review subagents may be used for architecture, performance, and bug or missing-functionality review passes.
- If a task is too large or too coupled to split safely, do not delegate delivery work to subagents; ask the user to narrow scope or help decompose it instead.

## Code Review

- Only flag concrete issues. Do not nitpick style, hypothetical edge cases that cannot happen, or "improvements" that change nothing meaningful.
- If a review finds nothing wrong, say "no issues found". Do not invent problems to appear thorough.
- After implementation and any relevant tests pass, automatically dispatch a dedicated architecture review subagent.
- Automatically dispatch a dedicated performance review subagent.
- Automatically dispatch a dedicated code bug and missing functionality review subagent.
- Do not commit an independent module or step until the required review subagent passes have finished and their findings have been resolved or explicitly accepted.
- The main agent remains responsible for dispatching those review passes, consolidating findings, resolving conflicts, and deciding the final changes.

## Using GitHub

- Never mention Claude Code in PR descriptions, PR comments, or issue comments.
- Use the gh tool for GitHub-related operations.
- Atomic development: when executing a multi-step plan, commit after each independent step completes only after relevant tests pass and the required review subagent passes are complete. Do not accumulate all
  changes into one final commit.
