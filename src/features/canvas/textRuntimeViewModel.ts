import type {
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
  CanvasTextFontSizeTier,
} from "@/types";
import type { CanvasTextSessionSnapshot } from "./textSessionState";

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
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  nodeById: Map<string, CanvasRenderableNode>;
  selectedElementIds: string[];
  textSession: CanvasTextSessionSnapshot;
}

const toCanvasTextOverlayModel = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasTextOverlayModel => {
  // Renderable path: use accumulated world coordinates from resolve.
  // Editable path (text session draft before materialisation, or a raw
  // editable input): draft has no parent context, fall back to its local
  // transform. This is correct for top-level text; grouped editable drafts
  // are a pre-existing limitation of the text-session lifecycle.
  const isRenderable = "worldX" in element;
  return {
    content: element.content,
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    id: element.id,
    rotation: isRenderable ? element.worldRotation : element.transform.rotation,
    x: isRenderable ? element.worldX : element.transform.x,
    y: isRenderable ? element.worldY : element.transform.y,
  };
};

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
  nodeById,
  textSession,
}: Pick<
  ResolveCanvasTextRuntimeViewModelOptions,
  "activeWorkbenchId" | "nodeById" | "textSession"
>) => {
  if (!textSession.id || textSession.workbenchId !== activeWorkbenchId) {
    return null;
  }

  if (isEditableTextElement(textSession.draft)) {
    return textSession.draft;
  }

  const editingTextElement = nodeById.get(textSession.id);
  return isEditableTextElement(editingTextElement) ? editingTextElement : null;
};

const resolveSelectedTextElement = ({
  displaySelectedElementIds,
  nodeById,
}: Pick<
  ResolveCanvasTextRuntimeViewModelOptions,
  "displaySelectedElementIds" | "nodeById"
>) => {
  if (displaySelectedElementIds.length !== 1) {
    return null;
  }

  const selectedElement = nodeById.get(displaySelectedElementIds[0]!);
  return isEditableTextElement(selectedElement) ? selectedElement : null;
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
  hasActiveEditingText,
  nodeById,
  textSession,
}: Pick<
  ResolveCanvasTextRuntimeViewModelOptions,
  "displaySelectedElementIds" | "nodeById" | "textSession"
> & { hasActiveEditingText: boolean }): CanvasTextRuntimeSelectedElement[] =>
  displaySelectedElementIds
    .map((elementId) => {
      const element = nodeById.get(elementId);
      if (!element) {
        return null;
      }

      if (
        hasActiveEditingText &&
        textSession.draft &&
        textSession.id &&
        element.type === "text" &&
        element.id === textSession.id
      ) {
        return textSession.draft;
      }

      return element;
    })
    .filter((element): element is CanvasTextRuntimeSelectedElement => Boolean(element));

export const resolveCanvasTextRuntimeViewModel = ({
  activeWorkbenchId,
  displaySelectedElementIds,
  hasMarqueeSession,
  isMarqueeDragging,
  nodeById,
  selectedElementIds,
  textSession,
}: ResolveCanvasTextRuntimeViewModelOptions): CanvasTextRuntimeViewModel => {
  const editingTextElement = resolveEditingTextElement({
    activeWorkbenchId,
    nodeById,
    textSession,
  });
  const selectedTextElement = resolveSelectedTextElement({
    displaySelectedElementIds,
    nodeById,
  });
  const activeTextElement = editingTextElement ?? selectedTextElement;
  const activeTextEditorModel = activeTextElement
    ? toCanvasTextEditorModel(activeTextElement)
    : null;
  const textOverlayModel = activeTextElement ? toCanvasTextOverlayModel(activeTextElement) : null;
  const hasActiveEditingText = Boolean(editingTextElement && textSession.id);
  const hasTextUiSuppressedByMarquee = hasMarqueeSession || isMarqueeDragging;
  const activeEditingTextId =
    !hasTextUiSuppressedByMarquee && hasActiveEditingText ? textSession.id : null;
  const displaySelectedElements = resolveDisplaySelectedElements({
    displaySelectedElementIds,
    hasActiveEditingText,
    nodeById,
    textSession,
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
      editingTextId: textSession.id,
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
