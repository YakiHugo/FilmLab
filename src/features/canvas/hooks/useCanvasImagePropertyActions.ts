import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasCommand, CanvasRenderableElement, EditingAdjustments } from "@/types";
import {
  planCanvasImagePropertyCommand,
  type CanvasImagePropertyIntent,
} from "../imagePropertyState";

type CanvasRenderableImageElement = Extract<CanvasRenderableElement, { type: "image" }>;

interface CommitCanvasImagePropertyIntentOptions {
  activeWorkbenchId: string | null;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  imageElement: CanvasRenderableImageElement | null;
  intent: CanvasImagePropertyIntent;
}

export const commitCanvasImagePropertyIntent = async ({
  activeWorkbenchId,
  executeCommandInWorkbench,
  imageElement,
  intent,
}: CommitCanvasImagePropertyIntentOptions) => {
  if (!activeWorkbenchId || !imageElement) {
    return;
  }

  const command = planCanvasImagePropertyCommand({
    intent,
    node: imageElement,
  });
  if (!command) {
    return;
  }

  await executeCommandInWorkbench(activeWorkbenchId, command);
};

export function useCanvasImagePropertyActions(selectedImageElement: CanvasRenderableImageElement | null) {
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const executeCommandInWorkbench = useCanvasStore((state) => state.executeCommandInWorkbench);

  const commitIntent = useCallback(
    (intent: CanvasImagePropertyIntent) =>
      commitCanvasImagePropertyIntent({
        activeWorkbenchId,
        executeCommandInWorkbench,
        imageElement: selectedImageElement,
        intent,
      }),
    [activeWorkbenchId, executeCommandInWorkbench, selectedImageElement]
  );

  const setAdjustments = useCallback(
    (value: EditingAdjustments | undefined) =>
      commitIntent({ type: "set-image-adjustments", value }),
    [commitIntent]
  );

  const setFilmProfileId = useCallback(
    (value: string | undefined) =>
      commitIntent({
        type: "set-image-film-profile",
        value,
      }),
    [commitIntent]
  );

  return {
    commitIntent,
    imageElement: selectedImageElement,
    setAdjustments,
    setFilmProfileId,
  };
}
