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

## Local Follow-up (2026-03-22)

This handoff note was updated after a local, uncommitted follow-up on the overlay seam.

Files changed locally:

- `src/features/canvas/CanvasViewport.tsx`
- `src/features/canvas/hooks/useCanvasViewportOverlay.ts`
- `src/features/canvas/viewportOverlay.ts`
- `src/features/canvas/viewportOverlay.test.ts`

What changed locally:

- extracted `resolveSelectionOverlayMetrics` in `viewportOverlay.ts` so overlay metric resolution is centralized
- updated `useCanvasViewportOverlay` so a `findOne` miss no longer clears the overlay immediately; it now reuses the normal sync path so draft-text fallback can survive until a Konva node exists
- added pure tests for node-rect preference, draft fallback, and null-return cases
- fixed a follow-up runtime regression in `CanvasViewport` caused by reading `editingTextDraft` before the `useCanvasTextSession(...)` result had been initialized

Important status:

- these local changes are not committed
- they passed targeted static/test validation
- they were not browser-smoke-tested yet

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

What was not done:

- no browser/manual interaction smoke test was run after the second cut
- no browser/manual smoke test was run after the local overlay follow-up and the `editingTextDraft` TDZ fix
- the user reported a separate runtime symptom where, after hot update or dev-server restart, the page can stop accepting newly added elements; this has not been reproduced or investigated yet

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

### 2. Escape is not a true cancel

Problem:

- create-mode can materialize a node before final commit
- toolbar style updates can also persist before final commit
- Escape currently only closes the session, it does not roll back those writes

Impact:

- create-mode can leave behind a partially materialized text node
- font/color/size changes on existing text can survive an apparent cancel

Main places:

- [useCanvasTextSession.ts](/E:/project/FilmLab/src/features/canvas/hooks/useCanvasTextSession.ts)

### 3. New text create-mode toolbar can stay hidden during the first edit session

Problem:

- create-mode clears selection first
- the hook tries to select the new text id before it exists in the active workbench
- selection rejects unknown ids
- toolbar visibility still depends on a single selected element

Impact:

- the toolbar can stay hidden during the initial create/edit session for newly created text

Main places:

- [toolControllers.ts](/E:/project/FilmLab/src/features/canvas/tools/toolControllers.ts)
- [useCanvasTextSession.ts](/E:/project/FilmLab/src/features/canvas/hooks/useCanvasTextSession.ts)
- [CanvasViewport.tsx](/E:/project/FilmLab/src/features/canvas/CanvasViewport.tsx)
- [useCanvasInteraction.ts](/E:/project/FilmLab/src/features/canvas/hooks/useCanvasInteraction.ts)

### 4. Overlay draft fallback is still unstable when the Konva node does not exist

Problem:

- `useCanvasViewportOverlay` can compute a fallback rect from draft text data
- but the node-subscription effect still clears `selectionOverlay` immediately when `findOne` misses

Impact:

- overlay anchoring can disappear in draft-only cases, which is exactly where the fallback is meant to work

Main places:

- [useCanvasViewportOverlay.ts](/E:/project/FilmLab/src/features/canvas/hooks/useCanvasViewportOverlay.ts)

Local status (2026-03-22):

- there is now a local, uncommitted fix attempt for this seam
- do not mark this bug closed until browser verification confirms that:
  - draft-only text editing keeps its overlay anchor
  - the anchor survives until the Konva node materializes
  - overlay/toolbar/editor anchoring does not flicker across the transition

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

It is not a good idea to continue directly into the remaining open bugs or architecture TODOs yet.

Why:

- a localized follow-up already surfaced one runtime regression (`Cannot access 'editingTextDraft' before initialization`) before smoke testing
- the local overlay fix is only statically/test validated, not browser validated
- a user-reported HMR/dev-server-restart insertion failure may still exist and may indicate a broader runtime-shell issue outside the overlay seam

Required before continuing:

- run browser smoke tests for text creation, existing-text editing, and non-text insertion
- explicitly verify that adding text/shapes/images still works after:
  - a normal hot update
  - a full dev-server restart
- watch the console for runtime exceptions during those flows

If those checks fail:

- investigate the runtime-shell failure first
- do not start the next bugfix/refactor while insert/create flows are still unreliable

If those checks pass:

- the next most reasonable product bug to tackle is still the create-mode toolbar visibility issue
- do not jump to the deferred architecture TODOs before the remaining concrete runtime bugs are stabilized

## Recommended Next Step

Best immediate target:

- validate the current local overlay follow-up in the browser
- reproduce or clear the "after hot update / restart, cannot add elements" report

Why this should come before any more runtime refactor work:

- the current workspace already contains uncommitted runtime-shell changes
- one runtime regression was already found while landing them
- continuing without validation risks stacking another bug on top of an unstable baseline

If the baseline is confirmed healthy, the next likely product bug target is:

- new text create-mode toolbar visibility

Not recommended as the immediate next step:

- broad tool runtime redesign
- persistence timing rewrite
- marquee / pan extraction
- full text-session view-model redesign

Those are valid later, but they are larger scope than the current seam work.

## Local Workspace Note

`refs/**` is ignored by git in this repo.

This file exists in the local workspace for handoff, but it will not be committed unless someone explicitly stages it with force.
