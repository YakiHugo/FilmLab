# Canvas Workbench Session Model

- Baseline commit: `dirty`
- Scope: replace the canvas all-workbenches-in-memory model with list-entry persistence plus a single loaded workbench editor session; keep document commands pure and defer selector/panel semantics to later slices

## Decisions

- Treat `CanvasWorkbench` as the canonical document model and keep document commands pure over arbitrary workbench documents.
- Introduce `CanvasWorkbenchListEntry` as a list projection for the workbench browser and header surfaces; list v1 is display-only.
- Introduce a single loaded editor session in the main canvas store: one loaded workbench, one draft, one history state, one interaction status.
- Remove `activeWorkbench*` as a document-state concept; keep `activePanel` because panel visibility is a true UI activation state.
- Remove the old delete-successor API (`nextWorkbenchId`) instead of keeping a no-op contract in the current-only session model.
- Keep runtime-only render caches and transient selection preview outside the main canvas store.
- Persist both workbench detail and list entry; list entry is materialized from the document on save, not hand-built by UI callers.
- Support explicit workbench cover preference via `preferredCoverAssetId` on the persisted workbench snapshot, with fallback to the first image asset when no preferred cover resolves.
- Do not preserve old canvas workbench data; this slice may reset the canvas IndexedDB stores as long as new-code initialization is stable.
- Keep the old selector layer only as a temporary compatibility shim where needed to keep the app compiling during the model swap.
- Remove the old selection-derived edit auto-open effect; edit panel visibility now opens only from explicit image/shape activation events in the viewport and layer panel.

## Validation

- Pass: `pnpm exec eslint src/types/canvas.ts src/lib/db.ts src/features/canvas/document/model.ts src/features/canvas/document/migration.ts src/features/canvas/document/patches.ts src/features/canvas/document/commands.ts src/features/canvas/store/canvasWorkbenchListEntry.ts src/features/canvas/store/canvasStoreTypes.ts src/features/canvas/store/canvasWorkbenchState.ts src/features/canvas/store/canvasWorkbenchMutationEngine.ts src/features/canvas/store/canvasWorkbenchPersistenceGateway.ts src/features/canvas/store/canvasWorkbenchService.ts src/features/canvas/store/canvasStoreSelectors.ts src/stores/canvasStore.ts src/components/layout/Header.tsx src/features/canvas/CanvasExportDialog.tsx src/features/canvas/CanvasViewport.tsx src/features/canvas/hooks/useCanvasRouteWorkbenchSync.ts src/features/canvas/hooks/useCanvasWorkbenchActions.ts src/features/canvas/hooks/useCanvasInteraction.ts src/features/canvas/hooks/useCanvasTextSessionPort.ts src/features/canvas/CanvasWorkbenchPanel.tsx src/features/image-lab/hooks/useImageLabAssetActions.ts src/stores/canvasStore.session-model.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts src/features/canvas/canvasPageState.test.ts src/stores/canvasStore.session-model.test.ts`
- Pass: `pnpm exec eslint src/stores/canvasStore.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts`
- Pass: `pnpm exec vitest --run src/stores/canvasStore.test.ts src/stores/canvasStore.session-model.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts src/features/canvas/canvasPageState.test.ts`
- Pass: `pnpm exec eslint src/stores/canvasStore.test.ts src/stores/canvasStore.session-model.test.ts src/stores/canvasStore.ts src/features/canvas/store/canvasWorkbenchService.ts src/features/canvas/store/canvasWorkbenchMutationEngine.ts src/features/canvas/store/canvasWorkbenchState.ts src/features/canvas/store/canvasStoreTypes.ts src/features/canvas/hooks/useCanvasWorkbenchActions.ts`
- Pass: `pnpm exec vitest --run src/stores/canvasStore.test.ts src/stores/canvasStore.session-model.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts src/features/canvas/canvasPageState.test.ts`
- Pass: `pnpm exec eslint src/stores/canvasStore.ts src/stores/canvasStore.test.ts src/pages/canvas.tsx src/features/canvas/editPanelSelection.ts src/features/canvas/editPanelSelection.test.ts src/features/canvas/canvasPageState.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/hooks/useCanvasSelectionActions.ts src/features/canvas/hooks/useCanvasViewportInteractionController.ts src/features/canvas/hooks/useCanvasLayerPanelModel.ts src/features/canvas/store/canvasWorkbenchService.ts src/features/canvas/store/canvasStoreTypes.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/CanvasViewport.tsx`
- Pass: `pnpm exec vitest --run src/stores/canvasStore.test.ts src/stores/canvasStore.session-model.test.ts src/features/canvas/editPanelSelection.test.ts src/features/canvas/canvasPageState.test.ts src/features/canvas/store/canvasStoreSelectors.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts src/features/canvas/store/canvasActiveWorkbenchPorts.test.ts`
- Pass: `pnpm exec vitest --run src/features/canvas src/stores/canvasStore.test.ts src/stores/canvasStore.session-model.test.ts`
- Fail: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
  First actionable failures remain outside this slice's focused validation boundary:
  - `src/features/canvas/boardImageRendering.test.ts`: nullability noise in existing test coverage
  - `src/features/canvas/CanvasImageEditPanel.tsx`: unrelated image-adjustment typing drift

## Follow-up

- Do the later selector naming cleanup in a separate slice; this refactor intentionally left compatibility selectors in place to keep current consumers running.

## Files

- `src/types/canvas.ts`
- `src/lib/db.ts`
- `src/features/canvas/store/canvasWorkbenchPersistenceGateway.ts`
- `src/features/canvas/store/canvasWorkbenchService.ts`
- `src/features/canvas/store/canvasWorkbenchState.ts`
- `src/features/canvas/store/canvasStoreTypes.ts`
- `src/features/canvas/store/canvasStoreSelectors.ts`
- `src/stores/canvasStore.ts`
- `src/features/canvas/editPanelSelection.ts`
- `src/features/canvas/hooks/useCanvasSelectionActions.ts`
- `src/features/canvas/hooks/useCanvasViewportInteractionController.ts`
- `src/features/canvas/hooks/useCanvasLayerPanelModel.ts`
- `src/pages/canvas.tsx`
- `src/stores/canvasStore.test.ts`
- `src/stores/canvasStore.session-model.test.ts`
- direct current-workbench consumers under `src/features/canvas` and `src/components/layout`
