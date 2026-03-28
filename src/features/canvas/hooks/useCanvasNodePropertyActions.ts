import { useCallback } from "react";
import type { CanvasCommand, CanvasRenderableNode, CanvasWorkbench } from "@/types";
import {
  planCanvasNodePropertyCommand,
  type CanvasNodePropertyIntent,
  type CanvasNodePropertyPlannerTarget,
} from "../propertyPanelState";
import { useCanvasActiveWorkbenchCommands } from "./useCanvasActiveWorkbenchCommands";
import { useCanvasActiveWorkbenchState } from "./useCanvasActiveWorkbenchState";

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
  const { activeWorkbench } = useCanvasActiveWorkbenchState();
  const { executeCommand } = useCanvasActiveWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: CanvasNodePropertyIntent) => {
      void commitCanvasNodePropertyIntent({
        executeCommand,
        intent,
        node: selectedNode,
        workbench: activeWorkbench,
      });
    },
    [activeWorkbench, executeCommand, selectedNode]
  );

  return {
    activeWorkbench,
    commitIntent,
    selectedNode,
  };
}
