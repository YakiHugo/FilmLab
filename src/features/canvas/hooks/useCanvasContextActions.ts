import type Konva from "konva";
import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useAssetStore } from "@/stores/assetStore";
import type { Asset } from "@/types";
import { WORKSPACE_BACKGROUND_NODE_ID } from "../canvasViewportConstants";
import {
  resolveCanvasContextActionStates,
  type CanvasContextActionId,
  type CanvasContextActionState,
} from "../canvasContextActions";
import { resolveCanvasLayerOrderPlan } from "../canvasLayerOrderActions";
import { isCanvasShortcutMatch } from "../canvasShortcuts";
import { isSelectableSelectionTarget } from "../selectionGeometry";
import { resolvePrimarySelectedElement, resolveSelectedRootElementIds } from "../selectionModel";
import type { CanvasInteractionNotice } from "../viewportOverlay";
import { useCanvasHistoryActions } from "./useCanvasHistoryActions";
import { useCanvasHistoryState } from "./useCanvasHistoryState";
import { useCanvasLoadedWorkbenchState } from "./useCanvasLoadedWorkbenchState";
import { useCanvasLoadedWorkbenchStructure } from "./useCanvasLoadedWorkbenchStructure";
import { useCanvasSelectionActions } from "./useCanvasSelectionActions";

const WORKSPACE_GRID_NODE_ID = "canvas-workspace-grid";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  return target.isContentEditable;
};

const resolveCanvasElementIdFromStageTarget = (stage: Konva.Stage, target: Konva.Node | null) => {
  let current: Konva.Node | null = target;
  while (current && current !== stage) {
    const currentId = current.id();
    if (
      currentId &&
      currentId !== WORKSPACE_BACKGROUND_NODE_ID &&
      currentId !== WORKSPACE_GRID_NODE_ID
    ) {
      return currentId;
    }
    current = current.getParent();
  }
  return null;
};

const downloadAssetSource = (asset: Asset) => {
  const link = document.createElement("a");
  link.href = asset.objectUrl;
  link.download = asset.name;
  link.click();
};

export interface UseCanvasContextActionsOptions {
  onNotice: (notice: CanvasInteractionNotice) => void;
  onOpenExport: () => void;
  stageRef: RefObject<Konva.Stage>;
}

export interface CanvasContextActionsModel {
  actionStates: CanvasContextActionState[];
  handleContextMenuCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleShortcutKeyDown: (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => boolean;
  runAction: (actionId: CanvasContextActionId) => Promise<void>;
}

export function useCanvasContextActions({
  onNotice,
  onOpenExport,
  stageRef,
}: UseCanvasContextActionsOptions): CanvasContextActionsModel {
  const { loadedWorkbench } = useCanvasLoadedWorkbenchState();
  const assets = useAssetStore((state) => state.assets);
  const { canRedo, canUndo } = useCanvasHistoryState();
  const { redo, undo } = useCanvasHistoryActions();
  const { deleteNodes, duplicateNodes, groupNodes, reorderElements, ungroupNode } =
    useCanvasLoadedWorkbenchStructure();
  const {
    selectAll,
    selectElement,
    selectedElementIds,
    setSelectedElementIds,
  } = useCanvasSelectionActions();
  const [clipboardIds, setClipboardIds] = useState<string[]>([]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedElementIdSet = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);
  const primarySelectedElement = useMemo(
    () => resolvePrimarySelectedElement(loadedWorkbench, selectedElementIds),
    [loadedWorkbench, selectedElementIds]
  );
  const selectedRootIds = useMemo(
    () => resolveSelectedRootElementIds(loadedWorkbench, selectedElementIds),
    [loadedWorkbench, selectedElementIds]
  );
  const renderableNodeById = useMemo(
    () => new Map((loadedWorkbench?.allNodes ?? []).map((node) => [node.id, node])),
    [loadedWorkbench]
  );
  const selectedRootParentIds = useMemo(
    () =>
      new Set(
        selectedRootIds.map(
          (selectedRootId) => renderableNodeById.get(selectedRootId)?.parentId ?? null
        )
      ),
    [renderableNodeById, selectedRootIds]
  );
  const canSelectAll = Boolean(
    loadedWorkbench?.allNodes.some((node) => isSelectableSelectionTarget(node))
  );
  const bringForwardPlan = useMemo(
    () =>
      resolveCanvasLayerOrderPlan({
        action: "bring-forward",
        selectedElementIds,
        workbench: loadedWorkbench,
      }),
    [loadedWorkbench, selectedElementIds]
  );
  const bringToFrontPlan = useMemo(
    () =>
      resolveCanvasLayerOrderPlan({
        action: "bring-to-front",
        selectedElementIds,
        workbench: loadedWorkbench,
      }),
    [loadedWorkbench, selectedElementIds]
  );
  const sendBackwardPlan = useMemo(
    () =>
      resolveCanvasLayerOrderPlan({
        action: "send-backward",
        selectedElementIds,
        workbench: loadedWorkbench,
      }),
    [loadedWorkbench, selectedElementIds]
  );
  const sendToBackPlan = useMemo(
    () =>
      resolveCanvasLayerOrderPlan({
        action: "send-to-back",
        selectedElementIds,
        workbench: loadedWorkbench,
      }),
    [loadedWorkbench, selectedElementIds]
  );
  const actionStates = useMemo(
    () =>
      resolveCanvasContextActionStates({
        canBringForward: bringForwardPlan !== null,
        canBringToFront: bringToFrontPlan !== null,
        canCopy: selectedElementIds.length > 0,
        canDelete: selectedElementIds.length > 0,
        canDownloadImage:
          selectedElementIds.length === 1 &&
          primarySelectedElement?.type === "image" &&
          assetById.has(primarySelectedElement.assetId),
        canDuplicate: selectedElementIds.length > 0,
        canExport: Boolean(loadedWorkbench),
        canGroup: selectedRootIds.length >= 2 && selectedRootParentIds.size === 1,
        canPaste: clipboardIds.length > 0 || selectedElementIds.length > 0,
        canRedo,
        canSelectAll,
        canSendBackward: sendBackwardPlan !== null,
        canSendToBack: sendToBackPlan !== null,
        canShare: Boolean(loadedWorkbench),
        canUndo,
        canUngroup: selectedElementIds.length === 1 && primarySelectedElement?.type === "group",
      }),
    [
      assetById,
      bringForwardPlan,
      bringToFrontPlan,
      canRedo,
      canSelectAll,
      canUndo,
      clipboardIds.length,
      loadedWorkbench,
      primarySelectedElement,
      selectedElementIds.length,
      selectedRootIds.length,
      selectedRootParentIds.size,
      sendBackwardPlan,
      sendToBackPlan,
    ]
  );
  const runAction = useCallback(
    async (actionId: CanvasContextActionId) => {
      switch (actionId) {
        case "select-all":
          selectAll();
          return;
        case "copy-selection":
          if (selectedElementIds.length > 0) {
            setClipboardIds(selectedElementIds);
          }
          return;
        case "paste-selection": {
          const idsToDuplicate = clipboardIds.length > 0 ? clipboardIds : selectedElementIds;
          if (idsToDuplicate.length > 0) {
            await duplicateNodes(idsToDuplicate);
          }
          return;
        }
        case "duplicate-selection":
          if (selectedElementIds.length > 0) {
            await duplicateNodes(selectedElementIds);
          }
          return;
        case "delete-selection":
          if (selectedElementIds.length > 0) {
            await deleteNodes(selectedElementIds);
          }
          return;
        case "download-image": {
          if (selectedElementIds.length !== 1 || primarySelectedElement?.type !== "image") {
            return;
          }
          const asset = assetById.get(primarySelectedElement.assetId);
          if (!asset?.objectUrl) {
            onNotice({
              message: "Image source is not available yet.",
              type: "error",
            });
            return;
          }
          downloadAssetSource(asset);
          return;
        }
        case "export-workbench":
          onOpenExport();
          return;
        case "share-selection":
          onNotice({
            message: "Share isn't available yet.",
            type: "info",
          });
          return;
        case "tidy-up":
          return;
        case "bring-to-front":
          if (bringToFrontPlan) {
            await reorderElements(bringToFrontPlan.orderedIds, bringToFrontPlan.parentId);
          }
          return;
        case "bring-forward":
          if (bringForwardPlan) {
            await reorderElements(bringForwardPlan.orderedIds, bringForwardPlan.parentId);
          }
          return;
        case "send-backward":
          if (sendBackwardPlan) {
            await reorderElements(sendBackwardPlan.orderedIds, sendBackwardPlan.parentId);
          }
          return;
        case "send-to-back":
          if (sendToBackPlan) {
            await reorderElements(sendToBackPlan.orderedIds, sendToBackPlan.parentId);
          }
          return;
        case "undo":
          await undo();
          return;
        case "redo":
          await redo();
          return;
        case "group-selection":
          if (selectedElementIds.length > 1) {
            const groupId = await groupNodes(selectedElementIds);
            if (groupId) {
              setSelectedElementIds([groupId]);
            }
          }
          return;
        case "ungroup-selection":
          if (selectedElementIds.length === 1 && primarySelectedElement?.type === "group") {
            await ungroupNode(primarySelectedElement.id);
          }
          return;
        default:
          return;
      }
    },
    [
      assetById,
      bringForwardPlan,
      bringToFrontPlan,
      clipboardIds,
      deleteNodes,
      duplicateNodes,
      groupNodes,
      onNotice,
      onOpenExport,
      primarySelectedElement,
      redo,
      reorderElements,
      selectAll,
      selectedElementIds,
      sendBackwardPlan,
      sendToBackPlan,
      setSelectedElementIds,
      undo,
      ungroupNode,
    ]
  );

  const handleShortcutKeyDown = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
      if (isEditableTarget(event.target) || !loadedWorkbench) {
        return false;
      }

      for (const actionState of actionStates) {
        if (!actionState.shortcuts.some((shortcut) => isCanvasShortcutMatch(shortcut, event))) {
          continue;
        }

        event.preventDefault();
        if (actionState.enabled) {
          void runAction(actionState.id);
        }
        return true;
      }

      return false;
    },
    [actionStates, loadedWorkbench, runAction]
  );

  const handleContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!loadedWorkbench || isEditableTarget(event.target)) {
        return;
      }

      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      stage.setPointersPositions(event.nativeEvent);
      const pointer = stage.getPointerPosition();
      const targetNode = pointer ? stage.getIntersection(pointer) : null;
      const targetElementId = resolveCanvasElementIdFromStageTarget(stage, targetNode);
      if (!targetElementId || selectedElementIdSet.has(targetElementId)) {
        return;
      }

      flushSync(() => {
        selectElement(targetElementId);
      });
    },
    [loadedWorkbench, selectElement, selectedElementIdSet, stageRef]
  );

  return {
    actionStates,
    handleContextMenuCapture,
    handleShortcutKeyDown,
    runAction,
  };
}
