import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import { CanvasRuntimeContext } from "./canvasRuntimeContext";
import { createCanvasRuntimeScope } from "./canvasRuntimeScope";
import { on } from "@/lib/storeEvents";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasWorkbench } from "@/types";
import {
  createCanvasRuntimeAssetSnapshotById,
  createCanvasRuntimeScopeInput,
  resolveCanvasRuntimeAssetRenderFingerprint,
  type CanvasRuntimeAssetChangeSet,
} from "./canvasPreviewRuntimeState";

interface CanvasRuntimeProviderProps extends PropsWithChildren {
  workbench: CanvasWorkbench | null;
  workbenchId: string | null;
}

export function CanvasRuntimeProvider({
  children,
  workbench,
  workbenchId,
}: CanvasRuntimeProviderProps) {
  const [scope] = useState(() =>
    createCanvasRuntimeScope(
      createCanvasRuntimeScopeInput({
        assets: useAssetStore.getState().assets,
        viewportScale: useCanvasStore.getState().zoom,
        workbench,
        workbenchId,
      })
    )
  );
  const lastAssetSnapshotByIdRef = useRef(
    createCanvasRuntimeAssetSnapshotById(useAssetStore.getState().assets)
  );
  const effectLifetimeRef = useRef(0);

  // Keep runtime input current before child preview effects request new renders.
  useLayoutEffect(() => {
    scope.updateInput({
      ...scope.getInput(),
      workbench,
      workbenchId,
    });
  }, [scope, workbench, workbenchId]);

  useEffect(
    () => {
      const effectLifetime = effectLifetimeRef.current + 1;
      effectLifetimeRef.current = effectLifetime;
      const unsubscribeAssetChanges = on("assets:changed", (changedAssets) => {
        const previousAssetSnapshotById = lastAssetSnapshotByIdRef.current;
        const assetChangeSet: CanvasRuntimeAssetChangeSet = {
          changedAssetIds: new Set<string>(),
          nextAssetById: new Map(),
          nextAssetRenderFingerprintById: new Map(),
          nextAssetSnapshotById: previousAssetSnapshotById,
          renderChangedAssetIds: new Set<string>(),
        };

        for (const [assetId, asset] of changedAssets.entries()) {
          const previousAssetSnapshot = previousAssetSnapshotById.get(assetId);
          if (!asset) {
            previousAssetSnapshotById.delete(assetId);
            assetChangeSet.changedAssetIds.add(assetId);
            assetChangeSet.renderChangedAssetIds.add(assetId);
            continue;
          }

          if (previousAssetSnapshot?.asset === asset) {
            continue;
          }

          const nextRenderFingerprint = resolveCanvasRuntimeAssetRenderFingerprint(asset);
          previousAssetSnapshotById.set(assetId, {
            asset,
            renderFingerprint: nextRenderFingerprint,
          });
          assetChangeSet.changedAssetIds.add(assetId);
          assetChangeSet.nextAssetById.set(assetId, asset);
          assetChangeSet.nextAssetRenderFingerprintById.set(
            assetId,
            nextRenderFingerprint
          );
          if (previousAssetSnapshot?.renderFingerprint !== nextRenderFingerprint) {
            assetChangeSet.renderChangedAssetIds.add(assetId);
          }
        }

        if (assetChangeSet.changedAssetIds.size === 0) {
          return;
        }
        scope.syncRuntimeAssets(assetChangeSet);
        scope.refreshPreviewsForChangedAssets(assetChangeSet.renderChangedAssetIds);
      });
      const unsubscribeCanvasStore = useCanvasStore.subscribe((state) => {
        const currentInput = scope.getInput();
        if (currentInput.viewportScale === state.zoom) {
          return;
        }
        scope.updateInput({
          ...currentInput,
          viewportScale: state.zoom,
        });
      });
      const unsubscribeReset = on("currentUser:reset", () => {
        scope.reset();
      });

      return () => {
        unsubscribeReset();
        unsubscribeCanvasStore();
        unsubscribeAssetChanges();
        queueMicrotask(() => {
          if (effectLifetimeRef.current !== effectLifetime) {
            return;
          }
          scope.dispose();
        });
      };
    },
    [scope]
  );

  return (
    <CanvasRuntimeContext.Provider value={scope}>
      {children}
    </CanvasRuntimeContext.Provider>
  );
}
