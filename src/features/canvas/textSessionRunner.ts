import type {
  CanvasCommand,
  CanvasEditableTextElement,
} from "@/types";
import type { CanvasTextSessionEffect } from "./textSessionState";

export interface CanvasTextSessionPort {
  clearSelection: () => void;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  getActiveWorkbenchId: () => string | null;
  selectElement: (elementId: string) => void;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasEditableTextElement
  ) => Promise<void>;
}

interface RunCanvasTextSessionEffectsOptions {
  effects: CanvasTextSessionEffect[];
  port: CanvasTextSessionPort;
}

export const runCanvasTextSessionEffects = async ({
  effects,
  port,
}: RunCanvasTextSessionEffectsOptions) => {
  for (const effect of effects) {
    switch (effect.type) {
      case "clear-selection":
        port.clearSelection();
        break;
      case "delete-created":
        await port.executeCommandInWorkbench(
          effect.workbenchId,
          {
            type: "DELETE_NODES",
            ids: [effect.elementId],
          },
          effect.reason === "cancel" ? { trackHistory: false } : undefined
        );
        break;
      case "select-element":
        port.selectElement(effect.elementId);
        break;
      case "upsert-draft":
        await port.upsertElementInWorkbench(effect.workbenchId, effect.element);
        break;
      default:
        break;
    }
  }
};
