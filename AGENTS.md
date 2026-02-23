# FilmLab Repository Guidelines

> Last updated: 2026-02-16  
> This file is the quick collaboration guide.  
> Detailed architecture: `AGENT.md` and `docs/editor.md`.

## 1. Current Snapshot

- Tech stack: Vite + React 18 + TypeScript + Tailwind + Zustand + TanStack Router/Query
- Main routes: `/` (`Workspace`) and `/editor` (`Editor`)
- Rendering path:
  - PixiJS multi-pass (`src/lib/renderer/`) — sole GPU rendering path
- Persistence: IndexedDB via `idb` (`src/lib/db.ts`)
- AI recommendation API: `POST /api/recommend-film` (`api/recommend-film.ts`)

## 2. Project Structure

- `src/main.tsx`: app bootstrap (`QueryClientProvider` + router)
- `src/router.tsx`: TanStack Router definitions
- `src/pages/Workspace.tsx`: import/style/export workflow page
- `src/pages/Editor.tsx`: fine-tune editor page
- `src/features/workspace/`: workspace feature components and hooks
- `src/pages/editor/`: editor subcomponents and helpers
- `src/lib/imageProcessing.ts`: render entry (geometry + pipeline selection)
- `src/lib/film/`: v1 film profile data model and resolution
- `src/lib/renderer/`: PixiJS renderer, filters, LUT loader/cache, shader config
- `src/stores/`: Zustand stores (`projectStore.ts`, `editorStore.ts`)
- `src/data/`: presets and built-in film profiles
- `docs/`: project docs (`editor.md`, `film_pipeline.md`, `project_status.md`)

## 3. Commands

- `pnpm install`: install dependencies
- `pnpm dev`: generate shaders then run Vite dev server
- `pnpm build`: generate shaders + type check + production build
- `pnpm preview`: preview production build
- `pnpm generate:shaders`: regenerate shader outputs manually
- `pnpm vitest`: run tests (currently mainly `src/lib/ai/*.test.ts`)

## 4. Coding Conventions

- TypeScript + React function components
- 2-space indentation, semicolons, double quotes
- Use `@/` alias for `src/`
- Component files: PascalCase
- Hooks/utils: camelCase
- Keep route config in `src/router.tsx`
- Keep client state in Zustand stores under `src/stores/`

## 5. Rendering-Related Changes Checklist

When touching render features, update all of these together:

1. Types (`src/types/index.ts`, optional `src/types/film.ts`)
2. Uniform types (`src/lib/renderer/types.ts`)
3. Uniform mapping (`src/lib/renderer/uniformResolvers.ts`)
4. Shader config/templates (`src/lib/renderer/shader.config.ts`, `src/lib/renderer/shaders/templates/`)
5. Regenerated shaders (`pnpm generate:shaders`)
6. UI controls (`src/pages/editor/*` or `src/features/workspace/*`)

## 6. Data and Persistence

- Assets/project are persisted in IndexedDB (`src/lib/db.ts`)
- Imported assets include metadata + thumbnails (`src/lib/assetMetadata.ts`)
- Editor UI state (open sections/custom presets) partially uses localStorage

## 7. Documentation Rules

- Keep `AGENT.md` as the main engineering guide
- Keep `docs/editor.md` focused on editor/render implementation
- If behavior changes, update docs in the same PR

## 8. Commit/PR Guidance

- Prefer Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`
- PR should include:
  - clear scope
  - user-visible impact
  - testing steps
  - screenshots/GIF for UI changes
