import type { CanvasImageElement } from "@/types";
import { importAssetFiles } from "@/lib/assetImport";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { createId, resolveCanvasImageInsertionSize } from "@/utils";
import { snapPoint } from "../grid";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";
import {
  selectResolvedActiveWorkbenchId,
  selectWorkbenchById,
} from "../store/canvasStoreSelectors";

export function useCanvasEngine() {
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const upsertElementInWorkbench = useCanvasStore((state) => state.upsertElementInWorkbench);
  const assets = useAssetStore((state) => state.assets);

  const addAssetToCanvas = async (assetId: string, explicitWorkbenchId?: string) => {
    const canvasState = useCanvasStore.getState();
    const workbenchId = explicitWorkbenchId ?? selectResolvedActiveWorkbenchId(canvasState);
    if (!workbenchId) {
      return;
    }
    const workbench = selectWorkbenchById(canvasState, workbenchId);
    if (!workbench) {
      return;
    }

    const index = workbench.rootIds.length + 1;
    const asset = useAssetStore.getState().assets.find((candidate) => candidate.id === assetId);
    const initialSize = await resolveCanvasImageInsertionSize(asset);
    const initialPosition = snapPoint({
      x: 120 + index * 18,
      y: 100 + index * 18,
    });
    const element: CanvasImageElement = {
      id: createId("node-id"),
      type: "image",
      parentId: null,
      assetId,
      x: initialPosition.x,
      y: initialPosition.y,
      width: initialSize.width,
      height: initialSize.height,
      rotation: 0,
      transform: {
        x: initialPosition.x,
        y: initialPosition.y,
        width: initialSize.width,
        height: initialSize.height,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
    };
    await upsertElementInWorkbench(workbenchId, element);
  };

  const importAssetsToCanvas = async (filesInput: File[] | FileList) => {
    const targetWorkbenchId = selectResolvedActiveWorkbenchId(useCanvasStore.getState());
    if (!targetWorkbenchId) {
      return;
    }

    const { resolvedAssetIds } = await importAssetFiles(filesInput);
    for (const assetId of resolvedAssetIds) {
      await addAssetToCanvas(assetId, targetWorkbenchId);
    }
  };

  return {
    assets,
    addAssetToCanvas,
    canAddAssetsToCanvas: Boolean(activeWorkbenchId),
    importAssetsToCanvas,
  };
}
