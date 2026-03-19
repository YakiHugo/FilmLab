import type { CanvasDocument, CanvasElement, CanvasImageElement } from "@/types";

export interface CanvasSelectionModel {
  activeDocument: CanvasDocument | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIdSet: Set<string>;
  displaySelectedElementIds: string[];
  hasPreviewSelection: boolean;
  primarySelectedElement: CanvasElement | null;
  primarySelectedImageElement: CanvasImageElement | null;
}

const createElementById = (activeDocument: CanvasDocument | null) =>
  new Map((activeDocument?.elements ?? []).map((element) => [element.id, element]));

const resolvePrimarySelectedElementFromLookup = (
  elementById: Map<string, CanvasElement>,
  selectedElementIds: string[]
) => {
  if (selectedElementIds.length === 0) {
    return null;
  }

  return elementById.get(selectedElementIds[0]!) ?? null;
};

const resolvePrimarySelectedImageElementFromLookup = (
  elementById: Map<string, CanvasElement>,
  selectedElementIds: string[]
): CanvasImageElement | null => {
  for (const elementId of selectedElementIds) {
    const element = elementById.get(elementId);
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

  return activeDocument.elements.find((element) => element.id === selectedElementIds[0]) ?? null;
};

export const resolvePrimarySelectedImageElement = (
  activeDocument: CanvasDocument | null,
  selectedElementIds: string[]
): CanvasImageElement | null => {
  if (!activeDocument || selectedElementIds.length === 0) {
    return null;
  }

  for (const elementId of selectedElementIds) {
    const element = activeDocument.elements.find((candidate) => candidate.id === elementId);
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
  elementById,
  hasPreviewSelection,
}: {
  activeDocument: CanvasDocument | null;
  committedSelectedElementIds: string[];
  displaySelectedElementIds: string[];
  elementById?: Map<string, CanvasElement>;
  hasPreviewSelection: boolean;
}): CanvasSelectionModel => {
  const resolvedElementById = elementById ?? createElementById(activeDocument);

  return {
    activeDocument,
    committedSelectedElementIds,
    displaySelectedElementIdSet: new Set(displaySelectedElementIds),
    displaySelectedElementIds,
    hasPreviewSelection,
    primarySelectedElement: resolvePrimarySelectedElementFromLookup(
      resolvedElementById,
      displaySelectedElementIds
    ),
    primarySelectedImageElement: resolvePrimarySelectedImageElementFromLookup(
      resolvedElementById,
      displaySelectedElementIds
    ),
  };
};
