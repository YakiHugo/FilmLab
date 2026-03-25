import { useCallback } from "react";
import type {
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextFontSizeTier,
} from "@/types";
import type { CanvasTextSessionPort } from "../textSessionRunner";
import { applyCanvasTextFontSizeTier } from "../textStyle";
import { useCanvasTextRuntimeViewModel } from "./useCanvasTextRuntimeViewModel";
import {
  useCanvasTextSession,
  type CanvasTextSessionActions,
} from "./useCanvasTextSession";

interface UseCanvasViewportTextSessionControllerOptions {
  elementById: Map<string, CanvasRenderableNode>;
  port: CanvasTextSessionPort;
  selectedElementIds: string[];
  singleSelectedTextElement: CanvasRenderableTextElement | null;
}

export function useCanvasViewportTextSessionController({
  elementById,
  port,
  selectedElementIds,
  singleSelectedTextElement,
}: UseCanvasViewportTextSessionControllerOptions) {
  const {
    actions: textSessionActions,
    session: textSession,
  } = useCanvasTextSession({
    elementById,
    port,
    selectedElementIds,
    singleSelectedTextElement,
  });

  return {
    textSession,
    textSessionActions,
  };
}

interface UseCanvasViewportTextEditingControllerOptions {
  activeWorkbenchId: string | null;
  displaySelectedElementIds: string[];
  elementById: Map<string, CanvasRenderableNode>;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  selectedElementIds: string[];
  textSession: ReturnType<typeof useCanvasTextSession>["session"];
  textSessionActions: CanvasTextSessionActions;
}

export function useCanvasViewportTextEditingController({
  activeWorkbenchId,
  displaySelectedElementIds,
  elementById,
  hasMarqueeSession,
  isMarqueeDragging,
  selectedElementIds,
  textSession,
  textSessionActions,
}: UseCanvasViewportTextEditingControllerOptions) {
  const textRuntimeViewModel = useCanvasTextRuntimeViewModel({
    activeWorkbenchId,
    displaySelectedElementIds,
    hasMarqueeSession,
    isMarqueeDragging,
    nodeById: elementById,
    selectedElementIds,
    textSession,
  });

  const handleTextColorChange = useCallback(
    (color: string) => {
      textSessionActions.updateDraft((element) => ({
        ...element,
        color,
      }));
    },
    [textSessionActions]
  );

  const handleTextFontFamilyChange = useCallback(
    (fontFamily: string) => {
      textSessionActions.updateDraft((element) => ({
        ...element,
        fontFamily,
      }));
    },
    [textSessionActions]
  );

  const handleTextFontSizeTierChange = useCallback(
    (fontSizeTier: CanvasTextFontSizeTier) => {
      textSessionActions.updateDraft((element) =>
        applyCanvasTextFontSizeTier(element, fontSizeTier)
      );
    },
    [textSessionActions]
  );

  return {
    handleTextColorChange,
    handleTextFontFamilyChange,
    handleTextFontSizeTierChange,
    textRuntimeViewModel,
  };
}
