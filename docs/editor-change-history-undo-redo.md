# Feature Plan: Editor Change History (Undo/Redo)

> Status: Proposed  
> Last updated: 2026-02-19  
> Scope: `/editor` fine-tune flow only

## 1. Background

The current editor flow supports direct parameter editing, reset, copy/paste, and preset/profile changes, but has no change history model:

- No undo/redo buttons in editor actions
- No keyboard undo/redo shortcuts
- No store-level history stack (`past`/`future`)
- No data contract for reversible editor operations

This document defines the product behavior and technical design for shipping a robust undo/redo feature that future agents and contributors can safely extend.

## 2. Goals

1. Provide reliable per-asset undo/redo in the editor.
2. Support both mouse UI and keyboard shortcuts.
3. Keep history granular enough to be useful, but not noisy during slider drags.
4. Avoid IndexedDB schema changes for initial release.
5. Keep future extension path open for a full "change record" panel.

## 3. Non-Goals (Initial Release)

1. Cross-page history (Workspace + Editor shared timeline).
2. Persisting history across browser refresh/restart.
3. Multi-user or collaborative history merging.
4. Full visual timeline panel with named operations.

## 4. Product Design

## 4.1 User Stories

1. As an editor user, I can undo accidental parameter edits.
2. As an editor user, I can redo actions I just undid.
3. As an editor user, dragging a slider creates one meaningful history step (not dozens).
4. As an editor user, switching to another asset does not mix histories between assets.

## 4.2 UX Surface

Primary entry points:

1. Add `Undo` and `Redo` buttons to the editor top action row (`EditorPreviewCard`).
2. Add keyboard shortcuts:
   - `Cmd/Ctrl + Z`: undo
   - `Cmd/Ctrl + Shift + Z`: redo
   - `Ctrl + Y`: redo (Windows parity)

Button behavior:

1. Disabled when no selected asset or stack is empty.
2. `aria-label` and `title` include shortcut hints.
3. Trigger action toast/status text similar to existing action messages.

## 4.3 Interaction Rules

1. History scope is per asset (`assetId` keyed).
2. Undo/redo tracks only editor-relevant fields:
   - `presetId`
   - `intensity`
   - `adjustments`
   - `filmProfileId`
   - `filmProfile`
   - `filmOverrides`
3. Any new edit after undo clears `future`.
4. Asset switch keeps independent stacks; returning to an asset restores its stack.
5. No-op changes are ignored (same snapshot before/after).

## 4.4 Operation Granularity

Single history step operations:

1. Preset change
2. Intensity change (on commit)
3. Film profile select/import
4. Film module toggles/amount/param changes
5. Reset all
6. Reset film overrides
7. Paste settings
8. Flip/aspect ratio/rotate-related commits

Slider behavior:

1. During drag: live preview updates.
2. On drag release (commit): push one history entry.

## 5. Technical Design

## 5.1 Current Constraints

1. `projectStore.updateAsset` currently persists every update to IndexedDB.
2. `projectStore.updateAssetOnly` exists and updates memory only.
3. `editorStore` currently holds UI state but no edit history.
4. `EditorSliderRow` currently only emits `onValueChange`.

## 5.2 Proposed Data Model

Add session-only history model in `editorStore`:

```ts
interface EditorAssetSnapshot {
  presetId?: string;
  intensity?: number;
  adjustments?: EditingAdjustments;
  filmProfileId?: string;
  filmProfile?: FilmProfile;
  filmOverrides?: FilmProfileOverrides;
}

interface AssetHistoryState {
  past: EditorAssetSnapshot[];
  future: EditorAssetSnapshot[];
  // Used for drag/session coalescing if needed.
  pending?: {
    key: string;
    before: EditorAssetSnapshot;
  };
}

type HistoryByAssetId = Record<string, AssetHistoryState>;
```

Recommended limits:

1. `MAX_HISTORY_PER_ASSET = 50`
2. Trim oldest entries when over limit.

## 5.3 Store APIs

Add to `editorStore`:

1. `canUndo(assetId: string): boolean`
2. `canRedo(assetId: string): boolean`
3. `pushHistory(assetId: string, before: EditorAssetSnapshot): void`
4. `undoSnapshot(assetId: string, current: EditorAssetSnapshot): EditorAssetSnapshot | null`
5. `redoSnapshot(assetId: string, current: EditorAssetSnapshot): EditorAssetSnapshot | null`
6. `clearHistory(assetId: string): void`
7. `clearAllHistory(): void` (optional)

Important invariant:

1. `undo` moves one snapshot `past -> future`
2. `redo` moves one snapshot `future -> past`
3. new edit clears `future`

## 5.4 Edit Application Pipeline

Introduce a single editor edit gateway in `useEditorState`:

1. Build `captureSnapshot(asset)` helper.
2. Build `applyEditorPatch(patch, options)` helper.
3. All editor-mutating actions route through this helper instead of directly calling `updateAsset`.

Flow:

1. Capture `before`
2. Apply change
3. Capture `after`
4. If changed:
   - `pushHistory(before)`
   - clear `future`
5. Persist final asset state

## 5.5 Slider Commit Strategy

Add commit event support:

1. Extend `EditorSliderRow` props with `onCommit?: (value: number) => void`.
2. Wire Radix `onValueCommit` through `Slider`.
3. During drag:
   - Update preview state via `updateAssetOnly` (optional optimization)
4. On commit:
   - Persist via `updateAsset`
   - Push one history entry

If optimization is deferred, still use `onValueCommit` to push only one history snapshot while allowing current update path.

## 5.6 Keyboard Handling

In `EditorPreviewCard` keydown handler:

1. Ignore editable targets (`input`, `textarea`, `select`, contentEditable).
2. Handle:
   - `Cmd/Ctrl+Z` (without Shift): undo
   - `Cmd/Ctrl+Shift+Z` or `Ctrl+Y`: redo
3. Prevent default browser behavior when handled.

## 5.7 Persistence Strategy

Initial release:

1. History is in-memory only (`editorStore`), not persisted to IndexedDB.
2. Refresh clears undo/redo stack.
3. Actual asset state remains persisted exactly as today.

Rationale:

1. No DB migration risk.
2. Lower implementation complexity.
3. Fast rollback if regressions occur.

## 5.8 External Mutation Safety

If selected asset changes outside editor history pipeline (future changes or Workspace actions):

1. Detect mismatch between current asset snapshot and history expectations.
2. Reset that asset history to avoid replaying stale snapshots.

Pragmatic initial rule:

1. When entering editor for an asset, seed empty history.
2. If `assetId` changes, do not carry pending coalescing state.

## 5.9 Accessibility

1. Buttons have explicit `aria-label`.
2. Disabled state is visually and semantically conveyed.
3. Keyboard shortcuts documented in UI tooltip/title text.
4. Status feedback uses existing polite live region pattern in preview card.

## 6. File-Level Change Plan

## 6.1 Required Files

1. `src/stores/editorStore.ts`
   - add history state and actions
2. `src/pages/editor/useEditorState.ts`
   - add snapshot capture and history-aware mutation wrappers
   - expose `handleUndo`, `handleRedo`, `canUndo`, `canRedo`
3. `src/pages/editor/EditorPreviewCard.tsx`
   - add buttons and keyboard bindings
4. `src/pages/editor/EditorSliderRow.tsx`
   - add `onCommit` support
5. `src/pages/editor/EditorAdjustmentPanel.tsx`
   - pass commit callbacks for sliders
6. `src/pages/editor/EditorPresetCard.tsx`
   - commit intensity slider changes as single history operation

## 6.2 Optional Helper File

1. `src/pages/editor/history.ts`
   - snapshot clone/equality helpers
   - history constants (`MAX_HISTORY_PER_ASSET`)

## 7. Rollout Plan

Phase 1 (MVP):

1. Undo/Redo buttons + keyboard shortcuts
2. Per-asset in-memory history stacks
3. Core operations integrated (preset/intensity/adjustments/module/reset/paste)

Phase 2 (stability/perf):

1. Slider commit coalescing cleanup
2. Optional switch to `updateAssetOnly` during drag + persist on commit
3. Improve change labels for future timeline panel

Phase 3 (optional product extension):

1. "Change Record" panel with operation labels and jump-to-step
2. Optional persisted history window (small ring buffer)

## 8. Testing Plan

## 8.1 Unit Tests

1. History push/trim behavior at max capacity.
2. Undo/redo stack transitions.
3. Future stack cleared on new edit after undo.
4. Snapshot equality prevents no-op entries.

## 8.2 Integration Tests (UI)

1. Slider drag then undo restores previous value.
2. Undo then redo round-trip returns exact state.
3. Asset A and Asset B histories remain isolated.
4. Keyboard shortcuts work and do not fire inside text input.

## 8.3 Manual Regression

1. Persisted final asset state still saved to IndexedDB.
2. Existing reset/copy/paste actions still function.
3. Render preview and histogram updates remain responsive.

## 9. Risks and Mitigations

1. Risk: history spam from high-frequency slider updates.
   - Mitigation: commit-level history entries; cap stack size.
2. Risk: stale history after external asset mutation.
   - Mitigation: clear per-asset history on mismatch/switch.
3. Risk: memory growth with large snapshots.
   - Mitigation: fixed max stack per asset + clone only needed fields.

## 10. Acceptance Criteria

1. User can undo and redo from both buttons and keyboard.
2. Undo/redo works for all editor operations listed in section 4.4.
3. Dragging a slider results in one history step per commit.
4. History is isolated per asset and does not cross-contaminate.
5. No IndexedDB schema migration is required for initial release.

## 11. Future Contributor Notes

When adding new editor-mutating behavior:

1. Route changes through the history-aware edit gateway.
2. Ensure new fields are included in `EditorAssetSnapshot` if reversible.
3. Add at least one undo/redo test for the new operation.
4. If operation is high-frequency, define a commit boundary.

