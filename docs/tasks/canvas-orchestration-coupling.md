# Canvas Orchestration Coupling

- Baseline commit: `HEAD`
- Branch: current working branch
- Scope: reduce coupling in canvas orchestration by splitting `canvasWorkbenchService`, replacing the page-level canvas model hook with narrower hooks, and shrinking viewport orchestration boundaries without changing export behavior, route shapes, or document command semantics

## Decisions

- Keep `useCanvasStore` as the only global canvas state container and preserve its public method names.
- Execute the work in three slices with validation boundaries: service split, page orchestration split, viewport orchestration split.
- Do not expand this task into export, runtime preview, or `document/*` semantic changes.
- Allow internal canvas hook/store call sites to tighten as long as canvas-external behavior and store entrypoints stay stable.
- Replace `useCanvasPageModel` with direct page composition of narrower hooks rather than introducing another page-level aggregate hook.
- Route text persistence through one active-workbench-bound text port so viewport no longer mixes active-workbench seams with raw store mutation APIs.

## Slice Status

### Slice 1

- Goal: split `canvasWorkbenchService` into queue/epoch coordination, persistence gateway, mutation/history engine, and node mutation helpers while keeping store integration stable.
- Validation gate:
  - `pnpm exec vitest --run src/stores/canvasStore.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts`
- Completed:
  - extracted queue and epoch state into `canvasWorkbenchTaskCoordinator`
  - extracted DB persistence and compensation handling into `canvasWorkbenchPersistenceGateway`
  - extracted command/history commit logic into `canvasWorkbenchMutationEngine`
  - extracted default workbench and node clone helpers into `canvasWorkbenchNodeHelpers`
  - reduced `canvasWorkbenchService` to service assembly and high-level orchestration only

### Slice 2

- Goal: remove `useCanvasPageModel` and compose route sync, edit-panel auto-open, slice selection, and export dialog state directly in the page.
- Validation gate:
  - `pnpm exec vitest --run src/features/canvas/canvasPageState.test.ts src/stores/canvasStore.test.ts`
  - browser smoke for route recovery and empty-state create flow
- Completed:
  - removed `useCanvasPageModel`
  - added dedicated hooks for route/workbench sync, edit-panel auto-open, and selected-slice lifecycle
  - moved export dialog open state into `CanvasPage`
  - made `src/pages/canvas.tsx` the direct page assembly point for canvas route state and local UI state

### Slice 3

- Goal: split viewport orchestration into derived scene state, interaction control, and text editing control; stop passing raw store mutation APIs into text session from viewport.
- Validation gate:
  - `pnpm exec vitest --run src/features/canvas/textSession.test.ts src/features/canvas/textSessionState.test.ts src/features/canvas/tools/toolControllers.test.ts src/features/canvas/selectionModel.test.ts`
  - browser smoke for selection, drag, marquee, text editing, pan/zoom, guide and slice overlays
- Completed:
  - added `useCanvasViewportSceneState` to own element indexing, single-selection derivation, guides, and grid bounds
  - added `useCanvasViewportInteractionController` to own pan/zoom, marquee, pointer orchestration, and drag/select handlers without reabsorbing lifecycle ownership
  - added `useCanvasViewportTextEditingController` to own text session, runtime text view model, and text draft styling handlers
  - added `useCanvasTextSessionPort` so text editing now persists through one active-workbench-bound port instead of raw store mutations passed down from viewport
  - rewired `CanvasViewport` into a composition root that binds lifecycle, scene, interaction, text editing, stage shell, and overlay host explicitly
  - reduced `CanvasViewportStageShell` and `CanvasViewportOverlayHost` to grouped render boundaries that accept `scene` / `interaction` / `textEditing` / `overlay` objects instead of expanding scalar prop lists

## Validation

- Passed:
  - Slice 1
    - `pnpm exec vitest --run src/stores/canvasStore.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts`
    - `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - Slice 2
    - `pnpm exec vitest --run src/features/canvas/canvasPageState.test.ts src/stores/canvasStore.test.ts`
    - `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - Slice 3
    - `pnpm exec vitest --run src/features/canvas/textSession.test.ts src/features/canvas/textSessionState.test.ts src/features/canvas/tools/toolControllers.test.ts src/features/canvas/selectionModel.test.ts`
    - `pnpm exec tsc -p tsconfig.app.json --noEmit`
    - browser smoke on `http://127.0.0.1:5175/canvas`
      - created text through the Text tool, committed it, reopened text editing, and cancelled with `Escape`
      - verified text drag by observing the Konva text node world position change
      - verified zoom in / zoom out / reset by observing `window.Konva.stages[0].scaleX()` and stage origin changes
      - verified hand-tool panning by observing `window.Konva.stages[0].x()` / `y()` change and reset back
      - verified marquee rendering by observing the transient dashed marquee rect on the Konva stage during drag
      - verified no browser errors with `agent-browser errors`
  - Final regression
    - `pnpm lint` (passes with pre-existing `react-refresh/only-export-components` warnings in unrelated files)
    - `pnpm exec tsc -p tsconfig.app.json --noEmit`
    - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
    - `pnpm build:client`

## Post-Review Fixes

- Removed the hidden `beginTextEditRef` wiring from [`CanvasViewport.tsx`](e:/project/FilmLab/src/features/canvas/CanvasViewport.tsx) by splitting text-session ownership from text runtime derivation. `CanvasViewport` now creates text session actions first and passes the real `begin` action directly into the interaction controller; the text editing controller only derives runtime view state and style mutations from that session state.
- Narrowed the global listener effects in [`CanvasViewportOverlayHost.tsx`](e:/project/FilmLab/src/features/canvas/CanvasViewportOverlayHost.tsx) to `session.id`, `onCancelTextEdit`, and `onCommitTextEdit` so text input no longer tears down and rebinds `window` / `document` listeners on each keystroke.
- Post-review validation:
  - `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - `pnpm exec vitest --run src/features/canvas/textSession.test.ts src/features/canvas/textSessionState.test.ts src/features/canvas/tools/toolControllers.test.ts src/features/canvas/selectionModel.test.ts`

## Risks

- `canvasWorkbenchService` currently mixes persistence and compensation logic with history commits; preserving behavior while splitting helpers is the highest regression risk.
- Removing `useCanvasPageModel` must keep recovery token ordering and route-to-store synchronization semantics unchanged.
- Viewport refactor must not regress text session commit/cancel behavior or marquee preview selection behavior.

## Handoff

- Record pass/fail per slice before moving to the next slice.
- If any slice fails validation and is not fixed immediately, stop, mark that slice blocked in the JSON task file, and record the first actionable failure here.
