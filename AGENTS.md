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
- When refactoring, first propose what you consider best practice and let the user decide, rather than immediately compromising the workspace code

## Code Review

- Only flag issues that are real bugs, security vulnerabilities, or logic errors. Do not nitpick style, hypothetical edge cases that cannot happen, or
  "improvements" that change nothing meaningful.
- If a review finds nothing wrong, say "no issues found". Do not invent problems to appear thorough.
- After running tests, dispatch multiple sub-agents to review the code for architecture issues, missing implementation, code bugs, dead code cleanup opportunities, and performance problems.

## Using GitHub

- Never mention Claude Code in PR descriptions, PR comments, or issue comments.
- Use the gh tool for GitHub-related operations.
- Atomic development: when executing a multi-step plan, commit after each independent step completes (with tests passing). Do not accumulate all
  changes into one final commit.
