# Agent Guidelines

## Commit & Pull Request Guidelines
Follow Conventional Commit style: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf: ...`. Keep scopes specific (e.g., `renderer`, `library`, `editor`, `canvas`, `chat`, `ai`, `router`). For PRs, include:
- clear summary and rationale
- linked issue/task
- test evidence (`pnpm test`, `pnpm lint`, `pnpm build`)
- screenshots or short recordings for UI changes

---

## Self-Updating Instructions

**This file should evolve based on interactions.** When the user provides feedback, corrections, or clarifications, update this file to capture that knowledge for future sessions.

### When to Update This File
- **Style preferences**: When the user corrects formatting, naming, or code style choices
- **External dependencies**: When the user provides API keys, service URLs, or environment-specific values not in the codebase
- **Recurring corrections**: When the same mistake happens twice, document the correct approach
- **Workflow preferences**: When the user prefers a specific way of working (e.g., "always run tests before committing")
- **Project-specific gotchas**: Non-obvious behaviors, workarounds, or known issues the user explains

### How to Update
1. Ask user for confirmation before adding new rules
2. Keep entries concise and actionable (one line if possible)
3. Use specific examples over vague guidelines
4. Remove outdated rules when they no longer apply
5. Group related rules under appropriate headers

---

## Learned Preferences

<!-- Agent: Add user preferences below as you learn them -->

## External Context

<!-- Agent: Add external info the user provides (API endpoints, service names, etc.) -->

## Common Pitfalls

<!-- Agent: Document recurring mistakes and their fixes here -->
