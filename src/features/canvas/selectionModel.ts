import type {
  CanvasWorkbench,
  CanvasRenderableElement,
  CanvasRenderableNode,
} from "@/types";
import { getCanvasDescendantIds } from "./document/model";

export interface CanvasSelectionModel {
  activeWorkbench: CanvasWorkbench | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIdSet: Set<string>;
  displaySelectedElementIds: string[];
  hasPreviewSelection: boolean;
  primarySelectedElement: CanvasRenderableNode | null;
  primarySelectedImageElement: Extract<CanvasRenderableElement, { type: "image" }> | null;
}

const createNodeById = (activeWorkbench: CanvasWorkbench | null) =>
  new Map(
    (((activeWorkbench as CanvasWorkbench | null)?.allNodes ??
      ((activeWorkbench as unknown as { elements?: CanvasRenderableNode[] } | null)?.elements ?? [])) as CanvasRenderableNode[]
    ).map((node) => [node.id, node])
  );

const resolvePrimarySelectedNodeFromLookup = (
  nodeById: Map<string, CanvasRenderableNode>,
  selectedElementIds: string[]
) => {
  if (selectedElementIds.length === 0) {
    return null;
  }

  return nodeById.get(selectedElementIds[0]!) ?? null;
};

const resolvePrimarySelectedImageNodeFromLookup = (
  nodeById: Map<string, CanvasRenderableNode>,
  selectedElementIds: string[]
): Extract<CanvasRenderableElement, { type: "image" }> | null => {
  for (const elementId of selectedElementIds) {
    const element = nodeById.get(elementId);
    if (element?.type === "image") {
      return element;
    }
  }

  return null;
};

export const selectionIdsEqual = (
  left: string[] | null | undefined,
  right: string[] | null | undefined
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return left.length === right.length && left.every((id, index) => id === right[index]);
};

export const resolveDisplaySelectedElementIds = (
  selectionPreviewElementIds: string[] | null | undefined,
  committedSelectedElementIds: string[]
) => selectionPreviewElementIds ?? committedSelectedElementIds;

export const resolvePrimarySelectedElement = (
  activeWorkbench: CanvasWorkbench | null,
  selectedElementIds: string[]
) => {
  if (!activeWorkbench || selectedElementIds.length === 0) {
    return null;
  }

  const nodes =
    activeWorkbench.allNodes ??
    ((activeWorkbench as unknown as { elements?: CanvasRenderableNode[] }).elements ?? []);
  return nodes.find((node) => node.id === selectedElementIds[0]) ?? null;
};

export const resolvePrimarySelectedImageElement = (
  activeWorkbench: CanvasWorkbench | null,
  selectedElementIds: string[]
): Extract<CanvasRenderableElement, { type: "image" }> | null => {
  if (!activeWorkbench || selectedElementIds.length === 0) {
    return null;
  }

  const elements =
    activeWorkbench.elements ??
    ((activeWorkbench as unknown as { elements?: CanvasRenderableElement[] }).elements ?? []);
  for (const elementId of selectedElementIds) {
    const element = elements.find((candidate) => candidate.id === elementId);
    if (element?.type === "image") {
      return element;
    }
  }

  return null;
};

export const resolveSelectedRootElementIds = (
  activeWorkbench: Pick<CanvasWorkbench, "groupChildren" | "nodes"> | null,
  selectedElementIds: string[]
) => {
  if (!activeWorkbench || selectedElementIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(selectedElementIds)).filter((elementId) =>
    Boolean(activeWorkbench.nodes[elementId])
  );

  return uniqueIds.filter(
    (elementId) =>
      !uniqueIds.some(
        (candidateId) =>
          candidateId !== elementId &&
          getCanvasDescendantIds(activeWorkbench, candidateId).includes(elementId)
      )
  );
};

export const resolveSelectedRootRenderableElementIds = (
  activeWorkbench: Pick<CanvasWorkbench, "groupChildren" | "nodes"> | null,
  selectedElementIds: string[]
) =>
  resolveSelectedRootElementIds(activeWorkbench, selectedElementIds).filter((elementId) => {
    const element = activeWorkbench?.nodes[elementId];
    return Boolean(element && element.type !== "group");
  });

export const hasSelectedImageElement = (
  activeWorkbench: CanvasWorkbench | null,
  selectedElementIds: string[]
) => resolvePrimarySelectedImageElement(activeWorkbench, selectedElementIds) !== null;

export const createCanvasSelectionModel = ({
  activeWorkbench,
  committedSelectedElementIds,
  displaySelectedElementIds,
  nodeById,
  hasPreviewSelection,
}: {
  activeWorkbench: CanvasWorkbench | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIds: string[];
  nodeById?: Map<string, CanvasRenderableNode>;
  hasPreviewSelection: boolean;
}): CanvasSelectionModel => {
  const resolvedNodeById = nodeById ?? createNodeById(activeWorkbench);

  return {
    activeWorkbench,
    committedSelectedElementIds,
    displaySelectedElementIdSet: new Set(displaySelectedElementIds),
    displaySelectedElementIds,
    hasPreviewSelection,
    primarySelectedElement: resolvePrimarySelectedNodeFromLookup(
      resolvedNodeById,
      displaySelectedElementIds
    ),
    primarySelectedImageElement: resolvePrimarySelectedImageNodeFromLookup(
      resolvedNodeById,
      displaySelectedElementIds
    ),
  };
};
