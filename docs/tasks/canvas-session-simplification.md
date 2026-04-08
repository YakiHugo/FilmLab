# Canvas Session Simplification

- Baseline: `dirty`
- Scope: simplify the single-session canvas editor by replacing directional history change sets with one bidirectional delta history, collapsing canvas mutation scheduling to one global queue, making canvas route activation open the requested workbench by id first, and reducing text editing to current-workbench click-to-edit with pre-switch auto-commit

## Decisions

- Keep the single loaded-workbench session model introduced by earlier slices; `loadedWorkbenchId` remains separate from `workbench.id` in store state for now.
- Change runtime history from directional `forwardChangeSet` / `inverseChangeSet` pairs to one delta payload per entry and one `entries + cursor` container. Persisted workbench snapshots remain unchanged.
- Keep `CanvasCommand` as user-intent input interpreted against current document state; do not try to make commands globally state-independent in this slice.
- Collapse the service queue to one global mutation queue because the current product shape only supports one loaded editor session per app instance. Keep reset-epoch invalidation and keep list refresh outside that queue.
- Keep `workbenchInteraction` as `{ active, pendingCommits, queuedMutations }`, but align all write guards to the same meaning:
  - `active`: preview interaction open
  - `pendingCommits`: interaction finalization still settling
  - `queuedMutations`: queued or running non-preview mutation work
- Change canvas route activation to route-first: open the requested `workbenchId` directly, then refresh the side-panel list in the background. Only use list data for fallback or empty-state creation after a direct open fails.
- Simplify text editing to current-workbench scope only:
  - click editable text to begin editing
  - shift-click stays selection-only
  - drag threshold still produces drag instead of edit
  - switch workbench only after the active text session commits or no-ops
- Keep text style editing dual-mode behavior:
  - while text editing is active, property edits target the draft
  - otherwise, property edits target selected text nodes via commands

## Architecture After Change

- `src/features/canvas/document/*` remains the pure document kernel, but history payloads are now one bidirectional delta model instead of mirrored directional change sets.
- `src/features/canvas/store/canvasWorkbenchService.ts` remains the orchestration layer, but all mutating operations now serialize through one global queue and share one consistent interaction guard.
- `src/features/canvas/hooks/useCanvasRouteWorkbenchSync.ts` now treats the route `workbenchId` as the editor source of truth and uses list refresh only as background support for panel data and fallback.
- `src/features/canvas/textSession*` now models only one current-workbench editing session with explicit commit/cancel semantics; cross-workbench waiting and source-persist transition logic was removed.
- `src/pages/canvas.tsx` now provides a page-scoped workbench-transition guard so route sync and workbench actions can commit active text before switching sessions.

## Major Files

- `src/types/canvas.ts`
  - Replaced directional history types with `CanvasDocumentDeltaOp`, `CanvasDocumentDelta`, and `CanvasHistoryEntry { commandType, delta }`.
  - Kept persisted canvas snapshot shape unchanged.
- `src/features/canvas/store/canvasStoreTypes.ts`
  - Changed `CanvasHistoryState` from `{ past, future }` to `{ entries, cursor }`.
- `src/features/canvas/document/commands.ts`
  - Refactored command execution to emit one `delta` payload for each document change.
- `src/features/canvas/document/patches.ts`
  - Replaced directional change-set helpers with `diffCanvasDocumentDelta(...)` and `applyCanvasDocumentDelta(..., direction)`.
- `src/features/canvas/store/canvasWorkbenchState.ts`
  - Reworked history append, undo, redo, and truncation around `entries + cursor`.
- `src/features/canvas/store/canvasWorkbenchMutationEngine.ts`
  - Updated undo and redo to consume the same delta in opposite directions.
- `src/features/canvas/store/canvasWorkbenchTaskCoordinator.ts`
  - Collapsed per-workbench and lifecycle queues into one global mutation queue while keeping reset-epoch invalidation and deduped background list refresh.
- `src/features/canvas/store/canvasWorkbenchService.ts`
  - Routed all mutating flows through the new global queue.
  - Unified queue and interaction-state guard behavior.
  - Kept `init()` as background workbench-list refresh rather than editor activation.
- `src/features/canvas/canvasPageState.ts`
  - Narrowed page-state planning to fallback behavior only.
- `src/features/canvas/hooks/useCanvasRouteWorkbenchSync.ts`
  - Made route activation open the requested workbench directly before any list-driven fallback logic.
- `src/features/canvas/canvasWorkbenchTransitionGuard.tsx`
  - Added a page-scoped registration seam for pre-switch text commits.
- `src/pages/canvas.tsx`
  - Added the transition-guard provider around the canvas page tree.
- `src/features/canvas/hooks/useCanvasWorkbenchActions.ts`
  - Awaited the transition guard before create/select/delete flows that switch the loaded workbench.
- `src/features/canvas/textSession.ts`
  - Reduced text-session helper logic to current-workbench commit/cancel/materialize rules.
- `src/features/canvas/textSessionState.ts`
  - Rebuilt the reducer around `idle | editing | committing`.
- `src/features/canvas/textSessionRunner.ts`
  - Removed the text-local mutation queue and kept a simple sequential effect runner.
- `src/features/canvas/hooks/useCanvasTextSession.ts`
  - Made `commit()` async and suitable for pre-switch awaiting.
- `src/features/canvas/hooks/useCanvasTextSessionPort.ts`
  - Removed `getAvailableWorkbenchIds()` from the port boundary.
- `src/features/canvas/hooks/useCanvasViewportInteractionController.ts`
  - Changed text selection to begin editing on click for non-additive text selection.
- `src/features/canvas/elements/TextElement.tsx`
  - Removed double-click-only text edit triggers.
- `src/features/canvas/CanvasViewportStageShell.tsx`
  - Removed double-click text-edit plumbing from the stage shell.
- `src/features/canvas/CanvasViewport.tsx`
  - Registered the pre-switch text commit guard and aligned viewport interaction blocking with the full `workbenchInteraction` model.
- `src/features/canvas/document/shared.ts`
  - Changed generic cloning so nested `Blob` values keep identity during history and delta replay.
- `src/components/layout/Header.tsx`
  - Added the optional pre-switch guard call before create-and-navigate entry points that live outside the canvas page tree.
- `src/features/canvas/document/*.test.ts`, `src/features/canvas/store/*.test.ts`, `src/features/canvas/text*.test.ts`, `src/stores/canvasStore.test.ts`
  - Updated tests and fixtures for delta history, single global queue assumptions, simplified text session state, and route-first activation.

## Validation

- Pass: `pnpm exec vitest --run src/features/canvas/document/patches.test.ts src/features/canvas/document/commands.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas/textSession.test.ts src/features/canvas/textSessionState.test.ts src/features/canvas/textRuntimeViewModel.test.ts src/features/canvas/canvasPageState.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas/document/commands.test.ts src/features/canvas/document/patches.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/stores/canvasStore.test.ts src/features/canvas/textSession.test.ts src/features/canvas/textSessionState.test.ts src/features/canvas/canvasPageState.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/document/patches.test.ts src/features/canvas/textSessionState.test.ts src/stores/canvasStore.test.ts`
- Fail: `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - First actionable remaining failures are outside this slice:
    - `src/lib/imageProcessing.ts`
    - `src/features/image-lab/hooks/imageLabViewState.ts`
    - `src/pages/image-lab.tsx`
    - `src/render/image/renderSingleImage.ts`
    - `src/render/image/stateCompiler.ts`
- Blocked smoke: browser canvas smoke could not run to completion because the app currently fails during boot outside canvas scope.
  - First actionable runtime error: `src/lib/imageProcessing.ts` imports `resolveRenderProfileFromState` from `@/lib/film`, but `src/lib/film/index.ts` does not export it.

## Execution Record

- Completed: history payloads now use one delta entry plus one `entries + cursor` container instead of directional forward/inverse change sets and split past/future stacks.
- Completed: undo and redo now consume the same delta payload in opposite directions.
- Completed: canvas mutation scheduling now uses one global queue; list refresh no longer blocks route-first editor activation.
- Completed: `beginInteractionInWorkbench` and other mutation entry points now share the same `active/pendingCommits/queuedMutations` guard semantics.
- Completed: canvas route activation now opens by `workbenchId` directly and only consults list data for fallback after a direct open fails.
- Completed: text editing now begins on click for editable text, no longer relies on double-click, and commits before workbench switches triggered by route sync or workbench actions.
- Completed: cross-workbench text waiting/persisting session states and the text-local mutation queue were removed.
- Completed: focused canvas regression and broad canvas regression passed with the simplified history, queue, route, and text models.
- Completed: follow-up review fixes closed the remaining race and state-drift edges in this slice:
  - non-tracked document commits now clear redo branches
  - interaction diffs restore `updatedAt` without recording timestamp-only history entries
  - text auto-commit now reuses in-flight commit promises and queues a pending click-to-edit target instead of losing the first click
  - background list refresh now waits for the mutation queue to settle and retries when mutation versions change mid-read
  - session switches clear stale interaction bookkeeping and are blocked while `active`, `pendingCommits`, or `queuedMutations` are non-zero
  - `openWorkbench()` now guards its final state write with the reset epoch
  - delta replay preserves `thumbnailBlob` identity
- Completed: focused subagent re-reviews for history/delta, queue/route, and text/viewport converged to `no issues found` after the follow-up fixes.
- Blocked outside slice: app-wide `tsc` and browser smoke remain blocked by unrelated `image-lab` / `render/image` / `lib/imageProcessing` failures; this refactor does not change those domains.

## Unresolved

- Browser smoke for `/canvas/:id`, click-to-edit text, and pre-switch text auto-commit remains unverified in the running app until the unrelated film/image-processing import breakage is fixed.
- `MAX_CANVAS_HISTORY = 50` remains unchanged in this slice; retention policy was intentionally not revisited.
