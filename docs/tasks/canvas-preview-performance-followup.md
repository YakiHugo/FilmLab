# Canvas Preview Performance Follow-up

- Status: open
- Scope: reduce drag/resize preview cost without reintroducing a second source of truth for canvas state.

## Current State

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

## Next Slice

- Keep `final commit` semantics as-is: one gesture, one history entry, one persistence.
- Add a dedicated preview path that updates only affected nodes/subtrees instead of round-tripping the full workbench.
- Avoid introducing a second persisted document model. The preview path should still derive from document state, but commit only touched runtime structures.

## Suggested Direction

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

## Validation Boundary

- Targeted regression around drag preview and resize preview.
- Manual smoke for drag, resize, marquee, and post-gesture undo/redo.
- Final commit behavior must remain one history entry and one persistence boundary per gesture.
