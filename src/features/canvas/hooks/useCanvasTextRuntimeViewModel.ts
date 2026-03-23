import { useMemo, useRef } from "react";
import type { CanvasRenderableNode } from "@/types";
import {
  canvasTextEditorModelEqual,
  canvasTextOverlayModelEqual,
  canvasTextRuntimeSelectedElementsEqual,
  resolveCanvasTextRuntimeViewModel,
  type CanvasTextRuntimeViewModel,
} from "../textRuntimeViewModel";
import type { CanvasTextSessionSnapshot } from "../textSessionState";

interface UseCanvasTextRuntimeViewModelOptions {
  activeWorkbenchId: string | null;
  displaySelectedElementIds: string[];
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  nodeById: Map<string, CanvasRenderableNode>;
  selectedElementIds: string[];
  textSession: CanvasTextSessionSnapshot;
}

export function useCanvasTextRuntimeViewModel({
  activeWorkbenchId,
  displaySelectedElementIds,
  hasMarqueeSession,
  isMarqueeDragging,
  nodeById,
  selectedElementIds,
  textSession,
}: UseCanvasTextRuntimeViewModelOptions): CanvasTextRuntimeViewModel {
  const resolvedModel = useMemo(
    () =>
      resolveCanvasTextRuntimeViewModel({
        activeWorkbenchId,
        displaySelectedElementIds,
        hasMarqueeSession,
        isMarqueeDragging,
        nodeById,
        selectedElementIds,
        textSession,
      }),
    [
      activeWorkbenchId,
      displaySelectedElementIds,
      hasMarqueeSession,
      isMarqueeDragging,
      nodeById,
      selectedElementIds,
      textSession,
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
