import type { CanvasNodeId, CanvasWorkbench } from "@/types";
import { resolveSelectedRootElementIds } from "./selectionModel";

export type CanvasLayerOrderAction =
  | "bring-forward"
  | "send-backward"
  | "bring-to-front"
  | "send-to-back";

export interface CanvasLayerOrderPlan {
  orderedIds: CanvasNodeId[];
  parentId: CanvasNodeId | null;
}

const moveSelectedToBoundary = (
  orderedIds: CanvasNodeId[],
  selectedIdSet: Set<CanvasNodeId>,
  boundary: "start" | "end"
) => {
  const selectedIdsInOrder = orderedIds.filter((id) => selectedIdSet.has(id));
  const remainingIds = orderedIds.filter((id) => !selectedIdSet.has(id));
  return boundary === "start"
    ? [...selectedIdsInOrder, ...remainingIds]
    : [...remainingIds, ...selectedIdsInOrder];
};

const stepSelectedIds = (
  orderedIds: CanvasNodeId[],
  selectedIdSet: Set<CanvasNodeId>,
  direction: "backward" | "forward"
) => {
  const nextOrderedIds = orderedIds.slice();

  if (direction === "forward") {
    for (let index = nextOrderedIds.length - 2; index >= 0; index -= 1) {
      const currentId = nextOrderedIds[index]!;
      const nextId = nextOrderedIds[index + 1]!;
      if (selectedIdSet.has(currentId) && !selectedIdSet.has(nextId)) {
        nextOrderedIds[index] = nextId;
        nextOrderedIds[index + 1] = currentId;
      }
    }
    return nextOrderedIds;
  }

  for (let index = 1; index < nextOrderedIds.length; index += 1) {
    const currentId = nextOrderedIds[index]!;
    const previousId = nextOrderedIds[index - 1]!;
    if (selectedIdSet.has(currentId) && !selectedIdSet.has(previousId)) {
      nextOrderedIds[index] = previousId;
      nextOrderedIds[index - 1] = currentId;
    }
  }
  return nextOrderedIds;
};

const orderedIdsEqual = (left: CanvasNodeId[], right: CanvasNodeId[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const resolveSiblingOrder = (workbench: CanvasWorkbench, parentId: CanvasNodeId | null) =>
  parentId ? (workbench.groupChildren[parentId] ?? []).slice() : workbench.rootIds.slice();

export const resolveCanvasLayerOrderPlan = ({
  action,
  selectedElementIds,
  workbench,
}: {
  action: CanvasLayerOrderAction;
  selectedElementIds: string[];
  workbench: CanvasWorkbench | null;
}): CanvasLayerOrderPlan | null => {
  if (!workbench || selectedElementIds.length === 0) {
    return null;
  }

  const uniqueExistingSelectedIds = Array.from(new Set(selectedElementIds)).filter((selectedId) =>
    Boolean(workbench.nodes[selectedId])
  );
  const selectedRootIds = resolveSelectedRootElementIds(workbench, selectedElementIds);
  if (selectedRootIds.length === 0 || selectedRootIds.length !== uniqueExistingSelectedIds.length) {
    return null;
  }

  const renderableNodeById = new Map(workbench.allNodes.map((node) => [node.id, node]));
  const parentIds = Array.from(
    new Set(
      selectedRootIds.map(
        (selectedRootId) => renderableNodeById.get(selectedRootId)?.parentId ?? null
      )
    )
  );
  if (parentIds.length !== 1) {
    return null;
  }

  const parentId = parentIds[0] ?? null;
  const currentOrder = resolveSiblingOrder(workbench, parentId);
  const selectedIdSet = new Set(selectedRootIds);

  const nextOrder =
    action === "bring-to-front"
      ? moveSelectedToBoundary(currentOrder, selectedIdSet, "end")
      : action === "send-to-back"
        ? moveSelectedToBoundary(currentOrder, selectedIdSet, "start")
        : action === "bring-forward"
          ? stepSelectedIds(currentOrder, selectedIdSet, "forward")
          : stepSelectedIds(currentOrder, selectedIdSet, "backward");

  if (orderedIdsEqual(currentOrder, nextOrder)) {
    return null;
  }

  return {
    orderedIds: nextOrder,
    parentId,
  };
};
