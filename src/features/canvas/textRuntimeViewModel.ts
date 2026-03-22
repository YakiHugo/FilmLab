import type {
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
  CanvasTextFontSizeTier,
} from "@/types";

export interface CanvasTextOverlayModel {
  content: string;
  fontFamily: string;
  fontSize: number;
  id: string;
  rotation: number;
  x: number;
  y: number;
}

export interface CanvasTextEditorModel extends CanvasTextOverlayModel {
  color: string;
  fontSizeTier: CanvasTextFontSizeTier;
  textAlign: CanvasTextElement["textAlign"];
}

export type CanvasTextRuntimeSelectedElement =
  | Exclude<CanvasRenderableNode, { type: "text" }>
  | CanvasRenderableTextElement
  | CanvasTextElement;

export interface CanvasTextRuntimeViewModel {
  activeEditingTextId: string | null;
  activeTextEditorModel: CanvasTextEditorModel | null;
  displaySelectedElements: CanvasTextRuntimeSelectedElement[];
  renderedEditingTextDraft: CanvasTextElement | CanvasRenderableTextElement | null;
  showEditingTextSelectionOutline: boolean;
  showTextEditor: boolean;
  showTextToolbar: boolean;
  textOverlayModel: CanvasTextOverlayModel | null;
  trackedOverlayId: string | null;
}

interface ResolveCanvasTextRuntimeViewModelOptions {
  activeWorkbenchId: string | null;
  displaySelectedElementIds: string[];
  editingTextDraft: CanvasTextElement | null;
  editingTextId: string | null;
  editingTextWorkbenchId: string | null;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  nodeById: Map<string, CanvasRenderableNode>;
  selectedElementIds: string[];
}

const toCanvasTextOverlayModel = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasTextOverlayModel => ({
  content: element.content,
  fontFamily: element.fontFamily,
  fontSize: element.fontSize,
  id: element.id,
  rotation: element.rotation,
  x: element.x,
  y: element.y,
});

const toCanvasTextEditorModel = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasTextEditorModel => ({
  ...toCanvasTextOverlayModel(element),
  color: element.color,
  fontSizeTier: element.fontSizeTier,
  textAlign: element.textAlign,
});

const isCanvasTextElementEditable = (
  element:
    | (Partial<Pick<CanvasTextElement, "locked" | "visible">> &
        Partial<Pick<CanvasRenderableTextElement, "effectiveLocked" | "effectiveVisible">>)
    | null
    | undefined
) => Boolean(element && !(element.effectiveLocked ?? element.locked) && (element.effectiveVisible ?? element.visible));

const isEditableTextElement = (
  element: CanvasRenderableNode | CanvasTextElement | null | undefined
): element is CanvasRenderableTextElement | CanvasTextElement =>
  Boolean(element?.type === "text" && isCanvasTextElementEditable(element));

const resolveEditingTextElement = ({
  activeWorkbenchId,
  editingTextDraft,
  editingTextId,
  editingTextWorkbenchId,
  nodeById,
}: Pick<
  ResolveCanvasTextRuntimeViewModelOptions,
  "activeWorkbenchId" | "editingTextDraft" | "editingTextId" | "editingTextWorkbenchId" | "nodeById"
>) => {
  if (!editingTextId || editingTextWorkbenchId !== activeWorkbenchId) {
    return null;
  }

  if (isEditableTextElement(editingTextDraft)) {
    return editingTextDraft;
  }

  const editingTextElement = nodeById.get(editingTextId);
  return isEditableTextElement(editingTextElement) ? editingTextElement : null;
};

const resolveTrackedOverlayId = ({
  editingTextId,
  selectedElementIds,
  hasActiveEditingText,
}: {
  editingTextId: string | null;
  hasActiveEditingText: boolean;
  selectedElementIds: string[];
}) => {
  if (hasActiveEditingText && editingTextId) {
    return editingTextId;
  }

  return selectedElementIds.length === 1 ? selectedElementIds[0]! : null;
};

const resolveDisplaySelectedElements = ({
  displaySelectedElementIds,
  editingTextDraft,
  editingTextId,
  hasActiveEditingText,
  nodeById,
}: Pick<
  ResolveCanvasTextRuntimeViewModelOptions,
  "displaySelectedElementIds" | "editingTextDraft" | "editingTextId" | "nodeById"
> & { hasActiveEditingText: boolean }): CanvasTextRuntimeSelectedElement[] =>
  displaySelectedElementIds
    .map((elementId) => {
      const element = nodeById.get(elementId);
      if (!element) {
        return null;
      }

      if (
        hasActiveEditingText &&
        editingTextDraft &&
        editingTextId &&
        element.type === "text" &&
        element.id === editingTextId
      ) {
        return editingTextDraft;
      }

      return element;
    })
    .filter((element): element is CanvasTextRuntimeSelectedElement => Boolean(element));

export const resolveCanvasTextRuntimeViewModel = ({
  activeWorkbenchId,
  displaySelectedElementIds,
  editingTextDraft,
  editingTextId,
  editingTextWorkbenchId,
  hasMarqueeSession,
  isMarqueeDragging,
  nodeById,
  selectedElementIds,
}: ResolveCanvasTextRuntimeViewModelOptions): CanvasTextRuntimeViewModel => {
  const editingTextElement = resolveEditingTextElement({
    activeWorkbenchId,
    editingTextDraft,
    editingTextId,
    editingTextWorkbenchId,
    nodeById,
  });
  const activeTextElement = editingTextElement;
  const activeTextEditorModel = activeTextElement
    ? toCanvasTextEditorModel(activeTextElement)
    : null;
  const textOverlayModel = activeTextElement ? toCanvasTextOverlayModel(activeTextElement) : null;
  const hasActiveEditingText = Boolean(editingTextElement && editingTextId);
  const hasTextUiSuppressedByMarquee = hasMarqueeSession || isMarqueeDragging;
  const activeEditingTextId =
    !hasTextUiSuppressedByMarquee && hasActiveEditingText ? editingTextId : null;
  const displaySelectedElements = resolveDisplaySelectedElements({
    displaySelectedElementIds,
    editingTextDraft,
    editingTextId,
    hasActiveEditingText,
    nodeById,
  });

  return {
    activeEditingTextId,
    activeTextEditorModel,
    displaySelectedElements,
    renderedEditingTextDraft: editingTextElement,
    showEditingTextSelectionOutline:
      !hasTextUiSuppressedByMarquee &&
      hasActiveEditingText &&
      textOverlayModel !== null &&
      displaySelectedElementIds.length === 0,
    showTextEditor: !hasTextUiSuppressedByMarquee && hasActiveEditingText,
    showTextToolbar:
      !hasTextUiSuppressedByMarquee &&
      activeTextEditorModel !== null &&
      textOverlayModel !== null,
    textOverlayModel,
    trackedOverlayId: resolveTrackedOverlayId({
      editingTextId,
      hasActiveEditingText,
      selectedElementIds,
    }),
  };
};

export const canvasTextOverlayModelEqual = (
  left: CanvasTextOverlayModel | null,
  right: CanvasTextOverlayModel | null
) =>
  left === right ||
  (!!left &&
    !!right &&
    left.id === right.id &&
    left.content === right.content &&
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.rotation === right.rotation &&
    left.x === right.x &&
    left.y === right.y);

export const canvasTextEditorModelEqual = (
  left: CanvasTextEditorModel | null,
  right: CanvasTextEditorModel | null
) =>
  left === right ||
  (!!left &&
    !!right &&
    canvasTextOverlayModelEqual(left, right) &&
    left.color === right.color &&
    left.fontSizeTier === right.fontSizeTier &&
    left.textAlign === right.textAlign);

export const canvasTextRuntimeSelectedElementsEqual = (
  left: CanvasTextRuntimeSelectedElement[],
  right: CanvasTextRuntimeSelectedElement[]
) => left.length === right.length && left.every((element, index) => element === right[index]);
