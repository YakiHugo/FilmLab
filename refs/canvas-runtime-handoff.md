# Canvas Runtime Handoff

## Purpose

This note is for the next agent working on the canvas runtime shell.

It records:

- what was just completed
- which known bugs are still open
- which architecture TODOs were intentionally deferred
- what constraints should not be broken in the next step

This reflects repository state after:

- `1373fbc` `refactor(canvas): extract viewport overlay sync`
- `8763f38` `refactor(canvas): extract text editing session`
- `bdea173` `fix(canvas): preserve draft overlay fallback`

## Current State

The canvas data model is still broadly acceptable.
The current pressure point is still the runtime shell around `CanvasViewport`, not the document kernel.

What is now extracted:

- overlay sync logic is no longer owned directly by `CanvasViewport`
- text editing session state machine is no longer owned directly by `CanvasViewport`

Main files after the refactor:

- `src/features/canvas/CanvasViewport.tsx`
- `src/features/canvas/hooks/useCanvasViewportOverlay.ts`
- `src/features/canvas/hooks/useCanvasTextSession.ts`
- `src/features/canvas/viewportOverlay.ts`
- `src/features/canvas/textSession.ts`

What `CanvasViewport` still owns on purpose:

- stage mounting and layer composition
- marquee / pan runtime
- tool dispatch wiring
- final DOM overlay rendering
- final visibility gating for toolbar / editor / badge

## What Was Completed

### First cut

- extracted overlay sync into `useCanvasViewportOverlay`
- extracted pure overlay helpers into `viewportOverlay.ts`
- added pure tests for overlay helper logic

### Second cut

- extracted text editing session into `useCanvasTextSession`
- extracted pure text-session decisions into `textSession.ts`
- added pure tests for text-session decision logic
- rewired `CanvasViewport` to consume hook outputs instead of owning text session state/effects directly

## Local Follow-up (2026-03-22, runtime validation + true cancel)

This handoff note was updated after the runtime-shell stabilization pass and the true-cancel text follow-up.

Files changed locally:

- `src/features/canvas/CanvasViewport.tsx`
- `src/features/canvas/hooks/useCanvasTextSession.ts`
- `src/features/canvas/textSession.ts`
- `src/features/canvas/textSession.test.ts`

What changed locally:

- rebound viewport measurement when `activeWorkbenchId` becomes available so `CanvasViewport` no longer strands Konva at `1x1` after reload / init
- split internal text-session reset from explicit user cancel
- kept in-session text style changes session-local instead of writing through during edit
- rolled back materialized create-mode text on `Escape` via non-history delete
- added pure tests for cancel semantics alongside the existing commit/switch helpers

Important status:

- the reload / HMR runtime-shell blocker that left the stage at `1x1` is fixed locally
- `Escape is not a true cancel` is fixed locally for both create-mode materialization and existing-text style changes
- text and shape insertion were browser-validated after hot update
- text and shape insertion were browser-validated again after a full dev-client restart on a fresh origin

## Validation Already Run

Passed during the refactor:

- `pnpm test -- src/features/canvas/viewportOverlay.test.ts src/features/canvas/overlayGeometry.test.ts src/features/canvas/textStyle.test.ts`
- `pnpm test -- src/features/canvas/textSession.test.ts src/features/canvas/viewportOverlay.test.ts src/features/canvas/overlayGeometry.test.ts src/features/canvas/textStyle.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/features/canvas/CanvasViewport.tsx src/features/canvas/hooks/useCanvasTextSession.ts src/features/canvas/hooks/useCanvasViewportOverlay.ts src/features/canvas/textSession.ts src/features/canvas/textSession.test.ts`

Review outcomes:

- performance review: no issues found
- behavior-preservation review for the text-session extraction: no issues found
- architecture review: remaining follow-up suggestions exist, but they were deferred because they widen scope beyond the approved zero-behavior-change extraction

Passed locally after the overlay follow-up:

- `pnpm test -- src/features/canvas/viewportOverlay.test.ts src/features/canvas/overlayGeometry.test.ts src/features/canvas/textStyle.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/features/canvas/CanvasViewport.tsx src/features/canvas/hooks/useCanvasViewportOverlay.ts src/features/canvas/viewportOverlay.ts src/features/canvas/viewportOverlay.test.ts`

Passed locally after the text create-mode follow-up:

- `pnpm test -- src/features/canvas/textStyle.test.ts src/features/canvas/viewportOverlay.test.ts src/features/canvas/textSession.test.ts src/features/canvas/tools/toolControllers.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/features/canvas/CanvasViewport.tsx src/features/canvas/hooks/useCanvasTextSession.ts src/features/canvas/textSession.ts src/features/canvas/textSession.test.ts src/features/canvas/textStyle.ts src/features/canvas/textStyle.test.ts src/features/canvas/viewportOverlay.ts src/features/canvas/viewportOverlay.test.ts`

Browser-state validation completed locally:

- create-mode text shows the toolbar immediately, even before the node is committed to store selection
- the empty textarea now opens with a readable placeholder width (`147px` in local dev validation)
- the first non-empty input materializes the node and promotes it to committed single-selection without hiding the toolbar
- the create-mode draft now shows a visible active outline before committed selection is available

Passed locally after the runtime-shell + true-cancel follow-up:

- `pnpm test -- src/features/canvas/textSession.test.ts src/features/canvas/textStyle.test.ts src/features/canvas/viewportOverlay.test.ts src/features/canvas/tools/toolControllers.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/features/canvas/CanvasViewport.tsx src/features/canvas/hooks/useCanvasTextSession.ts src/features/canvas/textSession.ts src/features/canvas/textSession.test.ts`

Browser-state validation completed locally after the latest follow-up:

- after hot update, `CanvasViewport` no longer stays at `1x1`; the stage remeasures and accepts new text + shape inserts
- create-mode text still materializes on first input, and `Escape` now removes the temporary node entirely
- existing text size changes now stay local during edit and revert on `Escape` (`48 -> 36` in local validation)
- after a full dev-client restart on a fresh origin, creating a new workbench and inserting both text + shape still works
- no canvas-shell runtime exception was observed during those insert / edit flows

What was not done:

- no browser validation was run for image/library-driven insertion in this pass
- the unrelated asset-sync console warning (`Failed to reconcile remote changes Error: Not Found`) was not investigated here

## Known Open Bugs

These were identified after the text-session extraction review.
They were not fixed in `8763f38`.
They should be treated as real open issues, not closed.

### 1. Closing a source workbench can lose an active text draft

Problem:

- `useCanvasTextSession` persists on workbench switch by writing back to the original `editingTextWorkbenchId`
- if that workbench is closed first, later writes target a missing workbench id
- missing-workbench mutations are dropped by the store path

Impact:

- the latest text draft can be lost when a workbench is closed during an active text edit session

Main places:

- [useCanvasTextSession.ts](/E:/project/FilmLab/src/features/canvas/hooks/useCanvasTextSession.ts)
- [canvasStore.ts](/E:/project/FilmLab/src/stores/canvasStore.ts)

Closed locally on 2026-03-22:

- the create-mode toolbar-hidden bug is fixed
- the draft-only overlay fallback now survives until text materialization in local browser-state validation
- `Escape is not a true cancel` is fixed
- reload / HMR stage sizing no longer strands the runtime shell at `1x1`
- text + shape insertion now pass browser validation after hot update and after full dev-client restart

## Deferred Architecture TODOs

These are not necessarily bugs.
They were raised by architecture review and intentionally deferred because they expand the scope beyond the second cut.

### 1. Narrow the session-to-overlay contract

Current state:

- `useCanvasTextSession` still exposes full working text objects
- `useCanvasViewportOverlay` still consumes those objects directly for layout/overlay work

Why it matters:

- overlay is still coupled to the session hook's internal working-text model
- a later pass should likely expose a narrower overlay-facing contract instead of full mutable text objects

### 2. Move more visibility/view-model policy out of `CanvasViewport`

Current state:

- `CanvasViewport` still recombines hook outputs with local conditions for:
  - toolbar visibility
  - editor visibility
  - some live-draft rendering rules

Why it matters:

- the viewport is still partly reconstructing session policy instead of consuming a fully extracted session/view model

### 3. Unify the live-draft text rendering rule

Current state:

- the "draft text should override persisted text while editing" rule still appears in more than one place in `CanvasViewport`

Why it matters:

- this is another sign that the final session-aware render model is not fully centralized yet

## Important Constraints For The Next Agent

Do not accidentally break these current invariants:

- preview selection and committed selection are intentionally separate
- high-frequency interaction state still belongs in local state / refs, not global store
- DOM textarea editing over Konva text is still the correct direction; do not collapse it back into Konva editing
- this canvas runtime is being refactored in small seams; do not turn the next step into a rewrite

Also keep these scope decisions in mind:

- the second cut was deliberately zero-behavior-change in intent
- not every review suggestion should be folded into the same commit
- the next step should be chosen explicitly, not by opportunistic expansion

## Suitability Before Continuing

The baseline is now healthy enough to continue to the next concrete runtime bug.

Why:

- stage sizing survives reload / HMR in browser validation
- text + shape insertion work again after hot update and after full dev-client restart
- true cancel semantics are now in place, so the previously most visible text-session product bug is closed

Keep doing before any broader refactor:

- stay on concrete runtime/product bugs
- keep browser-validating insert/edit flows whenever touching `CanvasViewport` or `useCanvasTextSession`
- avoid widening into the deferred architecture TODOs unless a concrete bug forces it

## Recommended Next Step

Best immediate target:

- fix `Closing a source workbench can lose an active text draft`

Why this should come next:

- it is now the clearest remaining user-visible text-session bug in the handoff
- it sits in the same runtime seam that was just stabilized
- it can be addressed without reopening the broader architecture refactor

Not recommended as the immediate next step:

- broad tool runtime redesign
- persistence timing rewrite
- marquee / pan extraction
- full text-session view-model redesign

Those are still valid later, but they are larger scope than the remaining concrete runtime bug.

## Local Workspace Note

`refs/**` is ignored by git in this repo.

This file exists in the local workspace for handoff, but it will not be committed unless someone explicitly stages it with force.
