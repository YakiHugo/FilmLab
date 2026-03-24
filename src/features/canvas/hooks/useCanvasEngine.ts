import type { CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { createId, resolveCanvasImageInsertionSize } from "@/utils";
import { snapPoint } from "../grid";
import { useCanvasActiveWorkbenchCommands } from "./useCanvasActiveWorkbenchCommands";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";
import {
  selectActiveWorkbenchRootCount,
  selectResolvedActiveWorkbenchId,
} from "../store/canvasStoreSelectors";

export function useCanvasEngine() {
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const activeWorkbenchRootCount = useCanvasStore(selectActiveWorkbenchRootCount);
  const { upsertElement } = useCanvasActiveWorkbenchCommands();
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);
  const assets = useAssetStore((state) => state.assets);

  const addAssetToCanvas = async (assetId: string) => {
    if (!activeWorkbenchId) {
      return;
    }
    const workbenchId = activeWorkbenchId;
    const index = activeWorkbenchRootCount + 1;
    const asset = assets.find((candidate) => candidate.id === assetId);
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
    await upsertElement(element);
    if (selectResolvedActiveWorkbenchId(useCanvasStore.getState()) === workbenchId) {
      setSelectedElementIds([element.id]);
    }
  };

  return {
    assets,
    addAssetToCanvas,
    canAddAssetsToCanvas: Boolean(activeWorkbenchId),
  };
}
