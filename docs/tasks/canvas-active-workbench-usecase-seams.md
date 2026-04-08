# Canvas Active Workbench Usecase Seams

- Baseline commit: `a09ba82`
- Branch: `feat/canvas-optimize`
- Scope: replace the broad active-workbench facade with narrower read-state, command, structure, and history seams without changing store/service persistence semantics or export behavior

## Decisions

- Do not touch export semantics or stage snapshot fallback in this slice.
- Do not split UI state (`tool`, `zoom`, `viewport`, `activePanel`, `selectedElementIds`) out of `canvasStore` in this slice.
- Keep `canvasStore` and `canvasWorkbenchService` as the persistence and lifecycle boundary.
- Remove `useActiveCanvasWorkbench`; replace it with:
  - `useCanvasActiveWorkbenchState`
  - `useCanvasActiveWorkbenchCommands`
  - `useCanvasActiveWorkbenchStructure`
  - existing `useCanvasHistory`
- Put the null-safe no-op binding contract in pure helpers under `src/features/canvas/store`, not inside hooks.
- Keep `useCanvasTextSession` on explicit store APIs because it needs cross-workbench persistence semantics.
- Migrate only existing active-workbench consumers in this slice; do not widen the new seams for convenience.

## Outcome

- This slice is complete at the canvas-module level: the default active-workbench integration path is now split into read state, command ports, structure ports, and history seams.
- The old broad `useActiveCanvasWorkbench` facade is removed, and new consumers are expected to bind only the seam they need.
- Remaining global `tsc` / `test` / `build:client` failures are outside this slice in `image-lab` and `server` conversation routes.
- After this slice, the only clearly sub-`8.5` canvas architecture hotspot left in the audit is export/render boundary unification.

## Risks

- Consumers that were previously getting mixed read/write capabilities from one facade may end up reassembling those responsibilities if the new seams are not kept narrow.
- `CanvasViewport` still legitimately mixes read state with explicit text-session store ports; this slice narrows the default path, not every cross-workbench action.
- `useCanvasHistory` remains a separate seam by design; undo/redo must not drift back into the new command/structure hooks.

## Validation

- Passed focused regression:
  - `pnpm exec vitest --run src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts src/stores/canvasStore.test.ts src/features/canvas/hooks/useCanvasImagePropertyActions.test.ts src/features/canvas/textSession.test.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/tools/toolControllers.test.ts`
  - latest run: `7` files, `61` tests passed
- Passed broader canvas regression:
  - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
  - latest run: `33` files, `174` tests passed
- Passed:
  - `pnpm lint` with 5 existing warnings outside this slice
- Passed review:
  - architecture subagent: `no issues found`
  - bug/regression subagent: `no issues found`
  - performance subagent: `no issues found`
- Failed outside this slice:
  - `pnpm exec tsc -p tsconfig.app.json --noEmit`
    - first actionable failure: `src/features/image-lab/hooks/useImageGeneration.ts` expects `ImageGenerationResponse.assets` / `runs`
  - `pnpm test`
    - first actionable failure: `server/src/routes/image-conversation.test.ts` returns `500` instead of `200` in three conversation route cases
  - `pnpm build:client`
    - blocked by the same `image-lab` and `imageConversation` type errors outside the canvas seam

## Files

- `src/features/canvas/store/canvasStoreSelectors.ts`
- `src/features/canvas/store/canvasActiveWorkbenchPorts.ts`
- `src/features/canvas/hooks/useCanvasActiveWorkbenchState.ts`
- `src/features/canvas/hooks/useCanvasActiveWorkbenchCommands.ts`
- `src/features/canvas/hooks/useCanvasActiveWorkbenchStructure.ts`
- migrated consumers under `src/features/canvas/hooks/*`, `src/features/canvas/CanvasViewport.tsx`, and `src/features/canvas/hooks/useCanvasExport.ts`
- `docs/tasks/canvas-active-workbench-usecase-seams.json`
