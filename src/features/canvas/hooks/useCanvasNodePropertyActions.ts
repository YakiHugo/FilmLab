import { useCallback } from "react";
import type { CanvasCommand, CanvasRenderableNode, CanvasWorkbench } from "@/types";
import {
  planCanvasNodePropertyCommand,
  type CanvasNodePropertyIntent,
  type CanvasNodePropertyPlannerTarget,
} from "../propertyPanelState";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";
import { useCanvasLoadedWorkbenchState } from "./useCanvasLoadedWorkbenchState";

interface CommitCanvasNodePropertyIntentOptions {
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  intent: CanvasNodePropertyIntent;
  node: CanvasNodePropertyPlannerTarget | null;
  workbench?: CanvasWorkbench | null;
}

export const commitCanvasNodePropertyIntent = async ({
  executeCommand,
  intent,
  node,
  workbench = null,
}: CommitCanvasNodePropertyIntentOptions) => {
  if (!node) {
    return;
  }

  const command = planCanvasNodePropertyCommand({
    intent,
    node,
    workbench,
  });
  if (!command) {
    return;
  }

  await executeCommand(command);
};

export function useCanvasNodePropertyActions(selectedNode: CanvasRenderableNode | null) {
  const { loadedWorkbench } = useCanvasLoadedWorkbenchState();
  const { executeCommand } = useCanvasLoadedWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: CanvasNodePropertyIntent) => {
      void commitCanvasNodePropertyIntent({
        executeCommand,
        intent,
        node: selectedNode,
        workbench: loadedWorkbench,
      });
    },
    [executeCommand, loadedWorkbench, selectedNode]
  );

  return {
    activeWorkbench: loadedWorkbench,
    commitIntent,
    selectedNode,
  };
}
