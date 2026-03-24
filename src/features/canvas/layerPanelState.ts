import { getCanvasDescendantIds } from "./documentGraph";
import type { CanvasRenderableNode, CanvasWorkbench } from "@/types";

export type CanvasLayerDropPlan =
  | { kind: "noop" }
  | { kind: "reorder"; orderedIds: string[]; parentId: string | null }
  | { kind: "reparent"; ids: string[]; index?: number; parentId: string | null };

const resolveSiblingLayerIds = (
  layers: Array<Pick<CanvasRenderableNode, "id" | "parentId">>,
  parentId: string | null
) => layers.filter((layer) => layer.parentId === parentId).map((layer) => layer.id);

export const planCanvasLayerDrop = ({
  draggingId,
  layers,
  targetId,
  workbench,
}: {
  draggingId: string | null;
  layers: CanvasRenderableNode[];
  targetId: string;
  workbench: CanvasWorkbench | null;
}): CanvasLayerDropPlan => {
  if (!draggingId || !workbench || draggingId === targetId) {
    return { kind: "noop" };
  }

  const fromLayer = layers.find((layer) => layer.id === draggingId);
  const targetLayer = layers.find((layer) => layer.id === targetId);
  if (!fromLayer || !targetLayer) {
    return { kind: "noop" };
  }

  const targetParentId = targetLayer.type === "group" ? targetLayer.id : (targetLayer.parentId ?? null);
  if (targetParentId === fromLayer.id) {
    return { kind: "noop" };
  }

  if (
    fromLayer.type === "group" &&
    targetParentId &&
    getCanvasDescendantIds(workbench, fromLayer.id).includes(targetParentId)
  ) {
    return { kind: "noop" };
  }

  if (fromLayer.parentId !== targetParentId) {
    const siblingIds = resolveSiblingLayerIds(layers, targetParentId);
    const targetIndex =
      targetLayer.type === "group" ? siblingIds.length : siblingIds.indexOf(targetLayer.id);

    return {
      kind: "reparent",
      ids: [fromLayer.id],
      index: targetIndex < 0 ? undefined : targetIndex,
      parentId: targetParentId,
    };
  }

  const siblingIds = resolveSiblingLayerIds(layers, targetParentId);
  const fromIndex = siblingIds.indexOf(fromLayer.id);
  const toIndex = siblingIds.indexOf(targetLayer.id);
  if (fromIndex < 0 || toIndex < 0) {
    return { kind: "noop" };
  }

  const orderedSiblingIds = siblingIds.slice();
  const [movedId] = orderedSiblingIds.splice(fromIndex, 1);
  if (!movedId) {
    return { kind: "noop" };
  }
  orderedSiblingIds.splice(toIndex, 0, movedId);

  return {
    kind: "reorder",
    orderedIds: orderedSiblingIds.reverse(),
    parentId: targetParentId,
  };
};
