# Canvas Preview Performance Follow-up

## Status

- Decision: do not implement the preview performance refactor in this slice.
- Reason: the remaining issue is structural, not a safe local patch. Correctness/state issues are already closed; only preview hot-path cost remains.

## Remaining Issue

- Drag and resize preview still run an `O(scene size)` document round-trip on each `rAF`.
- Current path:
  - `useCanvasViewportInteractionController` / `useCanvasViewportResizeController`
  - `canvasWorkbenchMutationEngine.previewCommandAgainstWorkbench(...)`
  - `executeCanvasCommand(...)`
  - full snapshot clone
  - `MOVE_NODES` also does an intermediate `resolveCanvasWorkbench(...)`
  - final full `resolveCanvasWorkbench(...)`
  - preview commit replaces the whole workbench in store
  - viewport rebuilds `elementById` and remaps the full `elements` list

## Files Involved

- `src/features/canvas/store/canvasWorkbenchMutationEngine.ts`
- `src/features/canvas/document/commands.ts`
- `src/features/canvas/store/canvasWorkbenchState.ts`
- `src/features/canvas/hooks/useCanvasViewportSceneState.ts`
- `src/features/canvas/CanvasViewportStageShell.tsx`
- `src/features/canvas/hooks/useCanvasViewportInteractionController.ts`
- `src/features/canvas/hooks/useCanvasViewportResizeController.ts`

## Why This Was Deferred

- The current interaction model is now correct and review-clean on architecture/state and correctness.
- The remaining hotspot sits at the document/runtime boundary.
- A partial optimization here is likely to create a second preview path and reintroduce the same multi-source-of-truth problems that were just removed.

## Recommended Next Slice

- Keep `final commit` semantics as-is: one gesture, one history entry, one persistence.
- Add a dedicated preview path that updates only affected nodes/subtrees instead of round-tripping the full workbench.
- Avoid introducing a second persisted document model. The preview path should still derive from document state, but commit only touched runtime structures.

## Recommended Direction

1. Split preview execution from final command execution.
2. Add specialized preview executors for:
   - `MOVE_NODES`
   - single-node `UPDATE_NODE_PROPS`
3. For preview only:
   - patch `nodes`
   - recompute only affected renderable nodes
   - preserve untouched `allNodes` / `elements` identities where possible
4. Change viewport derivation so `elementById` and element rendering do not rebuild from the full scene on every preview frame.

## Constraints

- Do not reintroduce `pendingCommitPreview`-style bridging state.
- Do not make Konva node state the source of truth.
- Do not change history or persistence semantics for final commit.
- Do not widen this slice into group/multi-select resize behavior.

## Validation Baseline At Deferral

- Review status:
  - architecture/state: no issues found
  - bug/regression: no issues found
  - performance: one remaining high issue, the preview hot path above
- Tests:
  - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
  - `36 files / 222 tests passed`

