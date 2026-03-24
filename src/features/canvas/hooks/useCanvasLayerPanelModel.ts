import { useCallback, useState } from "react";
import { planCanvasLayerDrop } from "../layerPanelState";
import { useCanvasInteraction } from "./useCanvasInteraction";
import { useCanvasLayers } from "./useCanvasLayers";
import { useCanvasSelectionModel } from "./useCanvasSelectionModel";

export function useCanvasLayerPanelModel() {
  const {
    activeWorkbench,
    activeWorkbenchId,
    assetById,
    deleteNodes,
    groupNodes,
    layers,
    reorderElements,
    reparentNodes,
    toggleElementLock,
    toggleElementVisibility,
    ungroupNode,
  } = useCanvasLayers();
  const { displaySelectedElementIdSet, displaySelectedElementIds, primarySelectedElement } =
    useCanvasSelectionModel();
  const { selectElement } = useCanvasInteraction();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDrop = useCallback(
    (layerId: string) => {
      const plan = planCanvasLayerDrop({
        draggingId,
        layers,
        targetId: layerId,
        workbench: activeWorkbench,
      });
      setDraggingId(null);

      if (!activeWorkbenchId) {
        return;
      }

      if (plan.kind === "reparent") {
        void reparentNodes(plan.ids, plan.parentId, plan.index);
        return;
      }

      if (plan.kind === "reorder") {
        void reorderElements(plan.orderedIds, plan.parentId);
      }
    },
    [activeWorkbench, activeWorkbenchId, draggingId, layers, reorderElements, reparentNodes]
  );

  return {
    assetById,
    displaySelectedElementIdSet,
    displaySelectedElementIds,
    draggingId,
    handleDelete: (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void deleteNodes([layerId]);
    },
    handleDragStart: (layerId: string) => {
      setDraggingId(layerId);
    },
    handleDrop,
    handleGroup: () => {
      if (!activeWorkbenchId || displaySelectedElementIds.length < 2) {
        return;
      }
      void groupNodes(displaySelectedElementIds);
    },
    handleSelect: (layerId: string, additive: boolean) => {
      selectElement(layerId, { additive });
    },
    handleToggleLock: (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementLock(layerId);
    },
    handleToggleVisibility: (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementVisibility(layerId);
    },
    handleUngroup: () => {
      if (!activeWorkbenchId || primarySelectedElement?.type !== "group") {
        return;
      }
      void ungroupNode(primarySelectedElement.id);
    },
    layers,
    primarySelectedElement,
  };
}
