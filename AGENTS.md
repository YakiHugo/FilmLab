# Repository Guidelines

## Project Structure & Module Organization
`src/` is the main application codebase. Entry points are `main.tsx`, `App.tsx`, and `router.tsx`. Route-level modules are feature pages under `src/features/` (`chat`, `library`, `editor`, `canvas`). Reusable UI and layout components are in `src/components/ui` and `src/components/layout`.

State is managed in `src/stores/` (`appStore.ts`, `assetStore.ts`, `editorStore.ts`, `canvasStore.ts`, `chatStore.ts`). Shared logic lives in `src/lib/` (notably `ai/`, `film/`, and `renderer/`). API handlers for serverless endpoints are in `api/` with shared API utilities in `api/_utils.ts`. Static files are in `public/`, fixtures in `test-assets/`, and build output in `dist/`.

## Build, Test, and Development Commands
- `pnpm install`: install dependencies.
- `pnpm dev`: generate shaders, then start Vite dev server.
- `pnpm build`: generate shaders, type-check (`tsc -b`), and build for production.
- `pnpm preview`: preview the production build locally.
- `pnpm test`: run Vitest once.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm lint` / `pnpm lint:fix`: run ESLint on `src/`.
- `pnpm format` / `pnpm format:check`: run Prettier for `src/**/*.{ts,tsx,css}`.

## Coding Style & Naming Conventions
Use TypeScript + React conventions with 2-space indentation, semicolons, double quotes, and trailing commas (`.prettierrc`). Keep components in PascalCase (`TopBar.tsx`), utilities in camelCase, and tests named `*.test.ts` colocated with related modules. Prefer the `@` alias for imports from `src/`. Do not manually edit generated shader files in `src/lib/renderer/shaders/generated`; update templates and run `pnpm run generate:shaders`.

## Testing Guidelines
Vitest is the test framework. Place unit tests beside implementation files (examples: `src/lib/*.test.ts`, `src/stores/*.test.ts`). Cover both standard and edge-case behavior for store logic, AI utilities, and renderer helpers. There is no enforced coverage threshold in scripts; new logic should ship with targeted tests.

## Commit & Pull Request Guidelines
Follow Conventional Commit style used in history: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `perf: ...`. Keep scopes specific (e.g., `renderer`, `library`, `editor`, `canvas`, `chat`, `ai`, `router`). For PRs, include:
- clear summary and rationale
- linked issue/task
- test evidence (`pnpm test`, `pnpm lint`, `pnpm build`)
- screenshots or short recordings for UI changes

## Security & Configuration Tips
Start from `.env.example` and define provider keys locally (`OPENAI_API_KEY`, plus optional `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`). Never commit secrets or local env files.
