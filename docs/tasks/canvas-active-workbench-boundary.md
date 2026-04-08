# Canvas Active Workbench Boundary

- Baseline commit: `a3a4cc3`
- Branch: `feat/canvas-optimize`
- Scope: shrink the canvas active-workbench application boundary by removing implicit active-store mutation APIs, introducing pure selectors, and routing first-wave consumers through a dedicated active-workbench seam

## Decisions

- Do not touch export domain semantics or unify the stage snapshot fallback in this slice.
- Keep `useCanvasStore` as the global state container for collection, lifecycle, and UI state.
- Remove implicit active-workbench mutation/history convenience methods from `CanvasState`; keep only explicit `...InWorkbench(workbenchId, ...)` store APIs.
- Introduce one `useActiveCanvasWorkbench` seam that binds the current `activeWorkbenchId` to a stable read/write contract with null-safe no-op behavior.
- Tighten the seam contract further after review: if `activeWorkbenchId` is set but the referenced workbench no longer exists, the seam must still collapse to the null/false/no-op contract instead of exposing a stale id-bound facade.
- Keep narrow consumers on pure selectors plus explicit `...InWorkbench` store APIs when the broad seam would cause unnecessary render churn; `useCanvasHistory` is the first carve-out.
- Introduce pure canvas store selectors under `src/features/canvas/store` so active workbench lookup, slice lookup, root count, and undo/redo availability stop being reimplemented across consumers.
- Limit consumer migration in this slice to `CanvasViewport`, `useCanvasInteraction`, `useCanvasLayers`, `useCanvasEngine`, `useCanvasHistory`, `useCanvasPropertiesPanelModel`, `useCanvasWorkbenchActions`, and `useCanvasExport`.
- Keep the recovery planner unchanged, but patch `useCanvasPageModel` so post-navigation recovery explicitly re-aligns `activeWorkbenchId` after fallback/create navigation. This fixes the observed delete-current recovery hole without changing recovery policy.
- Guard post-navigation recovery completion with a token plus committed-route check so an older recovery promise cannot overwrite a newer route selection.
- Back the pending-recovery marker with state as well as refs so clearing or superseding a recovery attempt still triggers a fresh recovery-plan evaluation.

## Risks

- `useCanvasStore` remains broadly readable for pure UI state and some non-migrated hooks; this slice narrows active-workbench use cases, not all store access.
- Export still retains the existing stage snapshot preview fallback by design.
- `useActiveCanvasWorkbench` still serves broad consumers such as viewport and interaction, so future migrations should prefer selectors for very narrow read models before expanding the seam again.
- Any missed consumer of removed implicit APIs will fail at compile time; this is intentional and should be resolved in-code rather than by reintroducing convenience methods.

## Validation

- Passed: `pnpm exec tsc -p tsconfig.app.json --noEmit`
- Passed: focused post-review regression
  - `pnpm exec vitest --run src/stores/canvasStore.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/hooks/useCanvasExport.test.ts src/features/canvas/canvasPageState.test.ts`
- Passed: focused canvas regression
  - `pnpm exec vitest --run src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/hooks/useCanvasImagePropertyActions.test.ts src/features/canvas/document/commands.test.ts src/features/canvas/document/patches.test.ts src/features/canvas/textSession.test.ts src/features/canvas/renderCanvasDocument.test.ts src/features/canvas/hooks/useCanvasExport.test.ts src/stores/canvasStore.test.ts`
- Passed: `pnpm lint` with 4 pre-existing `react-refresh/only-export-components` warnings outside this slice
- Passed: `pnpm test`
- Passed: `pnpm build:client`
- Passed: browser smoke on local preview for
  - create active workbench from header action
  - switch workbench via workbench list
  - delete current workbench and recover to the remaining route-bound workbench
  - open/export dialog and close it again
- Not automated: asset insertion and canvas-stage undo/redo
  - current `agent-browser` session can reach shell/panel controls, but the stage interaction path is not stably exposed as an interactive a11y target; regression confidence for those paths comes from the existing automated test suite

## Files

- `src/stores/canvasStore.ts`
- `src/features/canvas/store/canvasStoreSelectors.ts`
- `src/features/canvas/hooks/useActiveCanvasWorkbench.ts`
- `src/features/canvas/store/canvasStoreSelectors.test.ts`
- first-wave migrated consumers under `src/features/canvas/hooks/*` and `src/features/canvas/CanvasViewport.tsx`
- `docs/tasks/canvas-active-workbench-boundary.json`
