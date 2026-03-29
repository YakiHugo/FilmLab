# Canvas Selector Compatibility Retirement

- Baseline: `dirty`
- Scope: retire exported `activeWorkbench*` compatibility naming across canvas selectors, hooks, and port binders; migrate consumers to `loadedWorkbench*`; clear canvas-owned typecheck noise without expanding into unrelated `image-lab` or `render/image` follow-up work

## Decisions

- Use `loadedWorkbench*` as the canonical session-model seam vocabulary; do not introduce `currentWorkbench*`.
- Keep persisted store state and command APIs unchanged: `loadedWorkbenchId`, `patchWorkbench`, `executeCommandInWorkbench`, `redoInWorkbench`, and `undoInWorkbench` remain the stable persistence/lifecycle boundary.
- Rename exported seam contracts only where they remain cross-module interfaces: selector exports, hook names, port/binder names, and `useCanvasWorkbenchActions()` return fields.
- Remove compatibility selector exports after all in-repo consumers migrate; do not keep duplicate names alive.
- Canvas-owned type cleanup is limited to `src/features/canvas/**`, `src/stores/canvasStore.test.ts`, and any directly coupled test fixtures that block canvas validation.
- Remaining non-canvas `tsc` failures stay out of scope and must be recorded explicitly instead of being silently absorbed into this slice.

## Validation

- Targeted seam and canvas regression:
  - `pnpm exec vitest --run src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/textSession.test.ts src/stores/canvasStore.test.ts`
- Broad canvas regression:
  - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
- Type validation:
  - `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - Pass condition for this slice: no errors remain under `src/features/canvas/**`, `src/stores/canvasStore.test.ts`, or any newly touched canvas-coupled fixtures; any remaining errors must fall outside canvas scope and be recorded in the execution record.

## Execution Record

- Completed: exported canvas session seams now use `loadedWorkbench*` across selectors, port binders, hooks, and `useCanvasWorkbenchActions()` return fields.
- Completed: in-repo consumers migrated off compatibility selectors and `useCanvasActiveWorkbench*` modules; compatibility exports were removed rather than kept as aliases.
- Completed: canvas-owned `tsc` failures were cleared in:
  - `src/features/canvas/CanvasImageEditPanel.tsx`
  - `src/features/canvas/imagePropertyState.ts`
  - `src/features/canvas/boardImageRendering.test.ts`
  - `src/features/canvas/imageNodeFactory.test.ts`
  - `src/features/canvas/imagePropertyState.test.ts`
  - `src/features/editor/renderDocumentCanvas.test.ts`
  - `src/stores/canvasStore.test.ts`
- Passed targeted seam and store regression:
  - `pnpm exec vitest --run src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasLoadedWorkbenchPorts.test.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/textSession.test.ts src/stores/canvasStore.test.ts`
- Passed focused canvas-coupled render/property regression:
  - `pnpm exec vitest --run src/features/canvas/boardImageRendering.test.ts src/features/canvas/imageNodeFactory.test.ts src/features/canvas/imagePropertyState.test.ts src/features/editor/renderDocumentCanvas.test.ts`
- Passed broad canvas regression:
  - `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts`
- `pnpm exec tsc -p tsconfig.app.json --noEmit` still fails, but remaining first actionable errors are outside this slice:
  - `src/features/image-lab/hooks/imageLabViewState.ts`
  - `src/features/image-lab/hooks/useImageGeneration.snapshot.test.ts`
  - `src/features/image-lab/ImageChatFeed.test.tsx`
  - `src/lib/ai/imageModelCatalog.test.ts`
  - `src/pages/image-lab.tsx`
  - `src/render/image/asciiEffect.test.ts`
  - `src/render/image/renderSingleImage.test.ts`
  - `src/render/image/renderSingleImage.ts`
  - `src/render/image/stateCompiler.test.ts`
  - `src/render/image/stateCompiler.ts`
  - `src/render/image/types.test.ts`
