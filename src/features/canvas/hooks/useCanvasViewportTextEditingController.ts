import { useCallback } from "react";
import type {
  CanvasCommand,
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasWorkbench,
  CanvasTextFontSizeTier,
} from "@/types";
import { planCanvasNodePropertyCommand } from "../propertyPanelState";
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
  port,
}: UseCanvasViewportTextSessionControllerOptions) {
  const {
    actions: textSessionActions,
    session: textSession,
  } = useCanvasTextSession({
    port,
  });

  return {
    textSession,
    textSessionActions,
  };
}

interface UseCanvasViewportTextEditingControllerOptions {
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  displaySelectedElementIds: string[];
  elementById: Map<string, CanvasRenderableNode>;
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<CanvasWorkbench | null>;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  selectedElementIds: string[];
  singleSelectedTextElement: CanvasRenderableTextElement | null;
  textSession: ReturnType<typeof useCanvasTextSession>["session"];
  textSessionActions: CanvasTextSessionActions;
}

export function useCanvasViewportTextEditingController({
  activeWorkbench,
  activeWorkbenchId,
  displaySelectedElementIds,
  elementById,
  executeCommand,
  hasMarqueeSession,
  isMarqueeDragging,
  selectedElementIds,
  singleSelectedTextElement,
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

  const commitSelectedTextProperty = useCallback(
    (
      intent:
        | { type: "set-text-color"; value: string }
        | { type: "set-text-font-family"; value: string }
        | { type: "set-text-font-size-tier"; value: CanvasTextFontSizeTier }
    ) => {
      const hasActiveEditingSession =
        Boolean(textSession.id) &&
        textSession.workbenchId === activeWorkbenchId;

      if (
        !activeWorkbench ||
        !singleSelectedTextElement ||
        hasActiveEditingSession
      ) {
        return false;
      }

      const latestSelectedText =
        elementById.get(singleSelectedTextElement.id) ?? singleSelectedTextElement;
      if (latestSelectedText.type !== "text") {
        return false;
      }

      const command = planCanvasNodePropertyCommand({
        intent,
        node: latestSelectedText,
        workbench: activeWorkbench,
      });
      if (!command) {
        return false;
      }

      void executeCommand(command);
      return true;
    },
    [
      activeWorkbench,
      activeWorkbenchId,
      elementById,
      executeCommand,
      singleSelectedTextElement,
      textSession.id,
      textSession.workbenchId,
    ]
  );

  const handleTextColorChange = useCallback(
    (color: string) => {
      if (commitSelectedTextProperty({ type: "set-text-color", value: color })) {
        return;
      }
      textSessionActions.updateDraft((element) => ({
        ...element,
        color,
      }));
    },
    [commitSelectedTextProperty, textSessionActions]
  );

  const handleTextFontFamilyChange = useCallback(
    (fontFamily: string) => {
      if (commitSelectedTextProperty({ type: "set-text-font-family", value: fontFamily })) {
        return;
      }
      textSessionActions.updateDraft((element) => ({
        ...element,
        fontFamily,
      }));
    },
    [commitSelectedTextProperty, textSessionActions]
  );

  const handleTextFontSizeTierChange = useCallback(
    (fontSizeTier: CanvasTextFontSizeTier) => {
      if (commitSelectedTextProperty({ type: "set-text-font-size-tier", value: fontSizeTier })) {
        return;
      }
      textSessionActions.updateDraft((element) =>
        applyCanvasTextFontSizeTier(element, fontSizeTier)
      );
    },
    [commitSelectedTextProperty, textSessionActions]
  );

  return {
    handleTextColorChange,
    handleTextFontFamilyChange,
    handleTextFontSizeTierChange,
    textRuntimeViewModel,
  };
}
