import { useCallback, useMemo, useState } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { shouldOpenCanvasEditPanelForElement } from "../editPanelSelection";
import { planCanvasLayerDrop } from "../layerPanelState";
import {
  resolvePrimarySelectedElement,
  selectionIdsEqual,
} from "../selectionModel";
import { useCanvasLayers } from "./useCanvasLayers";
import { useCanvasSelectionActions } from "./useCanvasSelectionActions";

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
  const selectedElementIds = useCanvasStore(
    (state) => state.selectedElementIds,
    selectionIdsEqual
  );
  const openEditPanel = useCanvasStore((state) => state.openEditPanel);
  const { selectElement } = useCanvasSelectionActions();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const selectedElementIdSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds]
  );
  const primarySelectedElement = useMemo(
    () => resolvePrimarySelectedElement(activeWorkbench, selectedElementIds),
    [activeWorkbench, selectedElementIds]
  );

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

  const handleDelete = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void deleteNodes([layerId]);
    },
    [activeWorkbenchId, deleteNodes]
  );

  const handleDragStart = useCallback((layerId: string) => {
    setDraggingId(layerId);
  }, []);

  const handleGroup = useCallback(() => {
    if (!activeWorkbenchId || selectedElementIds.length < 2) {
      return;
    }
    void groupNodes(selectedElementIds);
  }, [activeWorkbenchId, groupNodes, selectedElementIds]);

  const handleSelect = useCallback(
    (layerId: string, additive: boolean) => {
      const didSelect = selectElement(layerId, { additive });
      if (
        didSelect &&
        shouldOpenCanvasEditPanelForElement({
          activeWorkbench,
          additive,
          elementId: layerId,
        })
      ) {
        openEditPanel();
      }
    },
    [activeWorkbench, openEditPanel, selectElement]
  );

  const handleToggleLock = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementLock(layerId);
    },
    [activeWorkbenchId, toggleElementLock]
  );

  const handleToggleVisibility = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementVisibility(layerId);
    },
    [activeWorkbenchId, toggleElementVisibility]
  );

  const handleUngroup = useCallback(() => {
    if (!activeWorkbenchId || primarySelectedElement?.type !== "group") {
      return;
    }
    void ungroupNode(primarySelectedElement.id);
  }, [activeWorkbenchId, primarySelectedElement, ungroupNode]);

  return {
    assetById,
    selectedElementIdSet,
    selectedElementIds,
    draggingId,
    handleDelete,
    handleDragStart,
    handleDrop,
    handleGroup,
    handleSelect,
    handleToggleLock,
    handleToggleVisibility,
    handleUngroup,
    layers,
    primarySelectedElement,
  };
}
