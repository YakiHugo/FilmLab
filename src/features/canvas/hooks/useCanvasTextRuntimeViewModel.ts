import { useMemo, useRef } from "react";
import type {
  CanvasRenderableNode,
  CanvasTextElement,
} from "@/types";
import {
  canvasTextEditorModelEqual,
  canvasTextOverlayModelEqual,
  canvasTextRuntimeSelectedElementsEqual,
  resolveCanvasTextRuntimeViewModel,
  type CanvasTextRuntimeViewModel,
} from "../textRuntimeViewModel";

interface UseCanvasTextRuntimeViewModelOptions {
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

export function useCanvasTextRuntimeViewModel({
  activeWorkbenchId,
  displaySelectedElementIds,
  editingTextDraft,
  editingTextId,
  editingTextWorkbenchId,
  hasMarqueeSession,
  isMarqueeDragging,
  nodeById,
  selectedElementIds,
}: UseCanvasTextRuntimeViewModelOptions): CanvasTextRuntimeViewModel {
  const resolvedModel = useMemo(
    () =>
      resolveCanvasTextRuntimeViewModel({
        activeWorkbenchId,
        displaySelectedElementIds,
        editingTextDraft,
        editingTextId,
        editingTextWorkbenchId,
        hasMarqueeSession,
        isMarqueeDragging,
        nodeById,
        selectedElementIds,
      }),
    [
      activeWorkbenchId,
      displaySelectedElementIds,
      editingTextDraft,
      editingTextId,
      editingTextWorkbenchId,
      hasMarqueeSession,
      isMarqueeDragging,
      nodeById,
      selectedElementIds,
    ]
  );

  const previousModelRef = useRef<CanvasTextRuntimeViewModel | null>(null);

  return useMemo(() => {
    const previousModel = previousModelRef.current;
    const activeTextEditorModel =
      previousModel &&
      canvasTextEditorModelEqual(
        previousModel.activeTextEditorModel,
        resolvedModel.activeTextEditorModel
      )
        ? previousModel.activeTextEditorModel
        : resolvedModel.activeTextEditorModel;
    const textOverlayModel =
      previousModel &&
      canvasTextOverlayModelEqual(previousModel.textOverlayModel, resolvedModel.textOverlayModel)
        ? previousModel.textOverlayModel
        : resolvedModel.textOverlayModel;
    const displaySelectedElements =
      previousModel &&
      canvasTextRuntimeSelectedElementsEqual(
        previousModel.displaySelectedElements,
        resolvedModel.displaySelectedElements
      )
        ? previousModel.displaySelectedElements
        : resolvedModel.displaySelectedElements;

    if (
      previousModel &&
      previousModel.activeEditingTextId === resolvedModel.activeEditingTextId &&
      previousModel.activeTextEditorModel === activeTextEditorModel &&
      previousModel.displaySelectedElements === displaySelectedElements &&
      previousModel.renderedEditingTextDraft === resolvedModel.renderedEditingTextDraft &&
      previousModel.showEditingTextSelectionOutline ===
        resolvedModel.showEditingTextSelectionOutline &&
      previousModel.showTextEditor === resolvedModel.showTextEditor &&
      previousModel.showTextToolbar === resolvedModel.showTextToolbar &&
      previousModel.textOverlayModel === textOverlayModel &&
      previousModel.trackedOverlayId === resolvedModel.trackedOverlayId
    ) {
      return previousModel;
    }

    const nextModel = {
      ...resolvedModel,
      activeTextEditorModel,
      displaySelectedElements,
      textOverlayModel,
    };
    previousModelRef.current = nextModel;
    return nextModel;
  }, [resolvedModel]);
}
