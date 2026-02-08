# Repository Guidelines

## Project Structure & Module Organization
The app lives in `src/`, with feature areas split into `components/`, `pages/`, `stores/`, `lib/`, `types/`, and `data/`. Entry points are `src/main.tsx` and `src/App.tsx`; global styles live in `src/index.css`. Routing is configured in `src/router.tsx` (TanStack Router). Page-level screens live in `src/pages/` (e.g., `Workspace.tsx`, `Editor.tsx`) with feature subfolders such as `src/pages/editor/`. Shared UI is in `src/components/ui/`, layout primitives in `src/components/layout/`. Static assets belong in `public/`. Build and tooling config is in `vite.config.ts`, `tailwind.config.js`, and `tsconfig*.json`.

## Build, Test, and Development Commands
- `pnpm install`: install dependencies (repo uses `pnpm-lock.yaml`).
- `pnpm dev`: start the Vite dev server with hot reload.
- `pnpm build`: type-check and create a production build (`tsc -b` + `vite build`).
- `pnpm preview`: serve the production build locally.

## Coding Style & Naming Conventions
Use TypeScript + React. Match existing style: 2-space indentation, semicolons, and double quotes. Components use PascalCase filenames (e.g., `ExportPanel.tsx`), hooks are camelCase with a `use` prefix, and shared UI belongs in `src/components`. Use Tailwind utility classes directly in JSX and prefer the `@/` alias for `src/` imports. Keep TanStack Router route definitions colocated in `src/router.tsx`, and Zustand stores in `src/stores/`.

## Data, State, and Persistence
Local presets live in `src/data/`. Client-side persistence uses IndexedDB via helpers in `src/lib/` (see `idb` usage). State management is handled with Zustand in `src/stores/`.

## Testing Guidelines
No test framework is configured yet and there are no coverage requirements. If you add tests, keep them close to features using `*.test.tsx` or `src/__tests__/`, and wire a runner such as Vitest + React Testing Library.

## Docs
Product and architecture notes live in `docs/` (see `docs/prd.md`, `docs/mvp_plan.md`, and `docs/tech_stack_architecture.md`).

## Commit & Pull Request Guidelines
Git history mixes imperative messages and Conventional Commits (e.g., `feat: scaffold FilmLab MVP demo`). Prefer Conventional Commit prefixes going forward (`feat:`, `fix:`, `docs:`, `chore:`). For PRs, include a concise summary, link relevant issues, and attach screenshots or short GIFs for UI changes.
