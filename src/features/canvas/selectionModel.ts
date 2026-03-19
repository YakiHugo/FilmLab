import type {
  CanvasDocument,
  CanvasRenderableElement,
  CanvasRenderableNode,
} from "@/types";

export interface CanvasSelectionModel {
  activeDocument: CanvasDocument | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIdSet: Set<string>;
  displaySelectedElementIds: string[];
  hasPreviewSelection: boolean;
  primarySelectedElement: CanvasRenderableNode | null;
  primarySelectedImageElement: Extract<CanvasRenderableElement, { type: "image" }> | null;
}

const createNodeById = (activeDocument: CanvasDocument | null) =>
  new Map(
    (((activeDocument as CanvasDocument | null)?.allNodes ??
      ((activeDocument as unknown as { elements?: CanvasRenderableNode[] } | null)?.elements ?? [])) as CanvasRenderableNode[]
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
  activeDocument: CanvasDocument | null,
  selectedElementIds: string[]
) => {
  if (!activeDocument || selectedElementIds.length === 0) {
    return null;
  }

  const nodes =
    activeDocument.allNodes ??
    ((activeDocument as unknown as { elements?: CanvasRenderableNode[] }).elements ?? []);
  return nodes.find((node) => node.id === selectedElementIds[0]) ?? null;
};

export const resolvePrimarySelectedImageElement = (
  activeDocument: CanvasDocument | null,
  selectedElementIds: string[]
): Extract<CanvasRenderableElement, { type: "image" }> | null => {
  if (!activeDocument || selectedElementIds.length === 0) {
    return null;
  }

  const elements =
    activeDocument.elements ??
    ((activeDocument as unknown as { elements?: CanvasRenderableElement[] }).elements ?? []);
  for (const elementId of selectedElementIds) {
    const element = elements.find((candidate) => candidate.id === elementId);
    if (element?.type === "image") {
      return element;
    }
  }

  return null;
};

export const hasSelectedImageElement = (
  activeDocument: CanvasDocument | null,
  selectedElementIds: string[]
) => resolvePrimarySelectedImageElement(activeDocument, selectedElementIds) !== null;

export const createCanvasSelectionModel = ({
  activeDocument,
  committedSelectedElementIds,
  displaySelectedElementIds,
  nodeById,
  hasPreviewSelection,
}: {
  activeDocument: CanvasDocument | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIds: string[];
  nodeById?: Map<string, CanvasRenderableNode>;
  hasPreviewSelection: boolean;
}): CanvasSelectionModel => {
  const resolvedNodeById = nodeById ?? createNodeById(activeDocument);

  return {
    activeDocument,
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
