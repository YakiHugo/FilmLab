# Editor Interaction Retirement

- Baseline: `the standalone editor interaction/state stack is no longer on an active page route, but editor-named render/materialization helpers are still used by asset and canvas flows`
- Scope: retire the unused legacy editor interaction/session layer first, while preserving shared render/materialization, thumbnail, dependency, and canvas-reused UI helpers

## Decisions

- Retire only modules whose runtime consumers are the old editor interaction stack itself.
- Keep `src/features/editor/render*`, `thumbnail`, `history` snapshot equality helpers, `presetUtils`, and canvas-reused UI primitives for this slice.
- Remove `editorStore` instead of keeping a dead state container with one remaining `clearHistory` caller.
- If a helper is only retained because of the retired interaction stack, remove it in the same slice instead of leaving dead leaf modules behind.

## Slice Boundary

- In scope:
  - legacy editor session/store state
  - legacy editor hooks and keyboard/viewport interaction helpers
  - editor-only selection/color/crop-guide/histogram/waveform helpers with no remaining live consumers
  - tests that only cover retired modules
- Out of scope:
  - render-backed asset thumbnail generation
  - render-backed materialization / flatten / merge-down
  - render document / graph / composition seams still used by asset or canvas flows
  - canvas image edit panel UI primitives that currently live under `src/features/editor`

## Validation Boundary

- Prove no live source imports remain for the retired interaction/session modules.
- Pass focused tests for retained editor render/materialization and affected asset-store behavior.
- Pass typecheck for the changed surface or record the first actionable failure and stop.

## Execution Record

- Completed first slice:
  - removed the dead legacy editor session/store layer by deleting `src/stores/editorStore.ts` and its store-only tests
  - removed the dead editor interaction hooks: `src/features/editor/useEditorAdjustments.ts`, `src/features/editor/useEditorColorGrading.ts`, `src/features/editor/useEditorFilmProfile.ts`, `src/features/editor/useEditorHistory.ts`, `src/features/editor/useEditorKeyboard.ts`, `src/features/editor/useEditorSlices.ts`, `src/features/editor/useEditorState.ts`, `src/features/editor/useViewportZoom.ts`
  - removed editor-only helper leaves that existed only for the retired interaction stack: `src/features/editor/colorUtils.ts`, `src/features/editor/cropGeometry.ts`, `src/features/editor/cropGuides.ts`, `src/features/editor/editorPanelConfig.ts`, `src/features/editor/histogram.ts`, `src/features/editor/localAdjustments.ts`, `src/features/editor/selection.ts`, `src/features/editor/utils.ts`, `src/features/editor/waveform.ts`
  - trimmed `src/features/editor/document.ts` down to the retained render-document boundary by removing `createEditorDocument(...)` and the retired `EditorDocument` shape
  - updated `src/stores/assetStore.ts` so render-backed materialization no longer reaches into a dead `editorStore.clearHistory(...)` branch
  - updated retained tests:
    - `src/features/editor/document.test.ts` now covers only the retained render-document helpers
    - `src/stores/assetStore.materialization.test.ts` now asserts successful flatten output instead of clearing retired editor history

## Files

- `src/features/editor/document.ts`
  - Retained only the render-document path used by shared render/materialization flows.
- `src/features/editor/document.test.ts`
  - Removed coverage for the retired editor-session document builder.
- `src/stores/assetStore.ts`
  - Removed the last runtime dependency on `editorStore`.
- `src/stores/assetStore.materialization.test.ts`
  - Replaced the retired history-clearing assertion with a successful-flatten assertion.
- Deleted runtime modules:
  - `src/stores/editorStore.ts`
  - `src/features/editor/useEditorAdjustments.ts`
  - `src/features/editor/useEditorColorGrading.ts`
  - `src/features/editor/useEditorFilmProfile.ts`
  - `src/features/editor/useEditorHistory.ts`
  - `src/features/editor/useEditorKeyboard.ts`
  - `src/features/editor/useEditorSlices.ts`
  - `src/features/editor/useEditorState.ts`
  - `src/features/editor/useViewportZoom.ts`
  - `src/features/editor/colorUtils.ts`
  - `src/features/editor/cropGeometry.ts`
  - `src/features/editor/cropGuides.ts`
  - `src/features/editor/editorPanelConfig.ts`
  - `src/features/editor/histogram.ts`
  - `src/features/editor/localAdjustments.ts`
  - `src/features/editor/selection.ts`
  - `src/features/editor/utils.ts`
  - `src/features/editor/waveform.ts`
- Deleted test-only modules for retired code:
  - `src/stores/editorStore.history.test.ts`
  - `src/stores/editorStore.layers.test.ts`
  - `src/stores/editorStore.ui.test.ts`
  - `src/features/editor/histogram.test.ts`
  - `src/features/editor/localAdjustments.test.ts`
  - `src/features/editor/selection.test.ts`

## Validation

- Passed type validation:
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Passed focused retained-flow regression:
  - `pnpm exec vitest --run src/stores/assetStore.materialization.test.ts src/features/editor/document.test.ts src/features/editor/renderDocumentCanvas.test.ts src/features/editor/renderMaterialization.test.ts src/features/editor/renderGraph.test.ts`
- Passed live-source inventory for retired interaction/session symbols:
  - `rg -n --hidden "useEditorStore|useEditorState|useEditorSlices|useEditorAdjustments|useEditorColorGrading|useEditorFilmProfile|useEditorHistory|useViewportZoom|useEditorKeyboard|editorPanelConfig|cropGuides|colorUtils|cropGeometry" src`
  - no matches
  - `rg -n --hidden "createEditorDocument\(|EditorDocument\b" src`
  - no matches

## Handoff

- After this slice, any remaining `src/features/editor/*` modules should be treated as shared asset/canvas support until proven otherwise.
- A follow-up slice can rename or move the retained shared modules out of `features/editor` once the dead interaction layer is gone.
- Still open after this slice:
  - editor-named shared render/materialization modules remain in place
  - editor render graph stage taxonomy still carries the older `develop / film / fx / output` naming and should be cleaned up separately
