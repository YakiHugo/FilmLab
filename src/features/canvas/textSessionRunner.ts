import type { CanvasCommand, CanvasEditableTextElement, CanvasRenderableTextElement, CanvasTextElement } from "@/types";
import type { TextMutationQueue } from "./textMutationQueue";
import type { CanvasTextSessionEffect } from "./textSessionState";

export interface CanvasTextSessionPort {
  clearSelection: () => void;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  getActiveWorkbenchId: () => string | null;
  getAvailableWorkbenchIds: () => string[];
  selectElement: (elementId: string) => void;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasEditableTextElement
  ) => Promise<void>;
}

interface RunCanvasTextSessionEffectsOptions {
  effects: CanvasTextSessionEffect[];
  mutationQueue: TextMutationQueue;
  onSourcePersistFinished: (payload: {
    didPersistDraft: boolean;
    sessionToken: number;
    transitionToken: number;
  }) => void;
  port: CanvasTextSessionPort;
}

const toTextRollbackPatch = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasCommand & { type: "UPDATE_NODE_PROPS" } => ({
  type: "UPDATE_NODE_PROPS",
  updates: [
    {
      id: element.id,
      patch: {
        ...element.transform,
        color: element.color,
        content: element.content,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontSizeTier: element.fontSizeTier,
        locked: element.locked,
        opacity: element.opacity,
        textAlign: element.textAlign,
        visible: element.visible,
      },
    },
  ],
});

const enqueueDelete = (
  mutationQueue: TextMutationQueue,
  port: CanvasTextSessionPort,
  effect: Extract<CanvasTextSessionEffect, { type: "delete-created" }>
) =>
  mutationQueue.enqueue(() =>
    port.executeCommandInWorkbench(
      effect.workbenchId,
      {
        type: "DELETE_NODES",
        ids: [effect.elementId],
      },
      effect.reason === "cancel" ? { trackHistory: false } : undefined
    )
  );

export const hasCanvasTextSessionPersistEffect = (effects: CanvasTextSessionEffect[]) =>
  effects.some(
    (effect) =>
      (effect.type === "delete-created" || effect.type === "upsert-draft") &&
      effect.reason === "persist-source"
  );

export const runCanvasTextSessionEffects = ({
  effects,
  mutationQueue,
  onSourcePersistFinished,
  port,
}: RunCanvasTextSessionEffectsOptions) => {
  for (const effect of effects) {
    switch (effect.type) {
      case "clear-selection":
        port.clearSelection();
        break;
      case "delete-created": {
        const task = enqueueDelete(mutationQueue, port, effect);
        const transitionToken = effect.transitionToken;
        if (effect.reason === "persist-source" && transitionToken !== null) {
          void task.then(
            () =>
              onSourcePersistFinished({
                didPersistDraft: true,
                sessionToken: effect.sessionToken,
                transitionToken,
              }),
            () =>
              onSourcePersistFinished({
                didPersistDraft: false,
                sessionToken: effect.sessionToken,
                transitionToken,
              })
          );
        } else {
          void task;
        }
        break;
      }
      case "mark-existing-draft-persisted":
      case "reset-session":
        break;
      case "rollback-existing":
        void mutationQueue.enqueue(() =>
          port.executeCommandInWorkbench(
            effect.workbenchId,
            toTextRollbackPatch(effect.element),
            { trackHistory: false }
          )
        );
        break;
      case "select-element":
        port.selectElement(effect.elementId);
        break;
      case "upsert-draft": {
        const task = mutationQueue.enqueue(() =>
          port.upsertElementInWorkbench(effect.workbenchId, effect.element)
        );
        const transitionToken = effect.transitionToken;
        if (effect.reason === "persist-source" && transitionToken !== null) {
          void task.then(
            () =>
              onSourcePersistFinished({
                didPersistDraft: true,
                sessionToken: effect.sessionToken,
                transitionToken,
              }),
            () =>
              onSourcePersistFinished({
                didPersistDraft: false,
                sessionToken: effect.sessionToken,
                transitionToken,
              })
          );
        } else {
          void task;
        }
        break;
      }
      default:
        break;
    }
  }
};
