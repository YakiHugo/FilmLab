import { useCallback } from "react";
import type { CanvasCommand, CanvasRenderableElement, EditingAdjustments } from "@/types";
import {
  planCanvasImagePropertyCommand,
  type CanvasImagePropertyIntent,
} from "../imagePropertyState";
import { useCanvasActiveWorkbenchCommands } from "./useCanvasActiveWorkbenchCommands";

type CanvasRenderableImageElement = Extract<CanvasRenderableElement, { type: "image" }>;

interface CommitCanvasImagePropertyIntentOptions {
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  imageElement: CanvasRenderableImageElement | null;
  intent: CanvasImagePropertyIntent;
}

export const commitCanvasImagePropertyIntent = async ({
  executeCommand,
  imageElement,
  intent,
}: CommitCanvasImagePropertyIntentOptions) => {
  if (!imageElement) {
    return;
  }

  const command = planCanvasImagePropertyCommand({
    intent,
    node: imageElement,
  });
  if (!command) {
    return;
  }

  await executeCommand(command);
};

export function useCanvasImagePropertyActions(selectedImageElement: CanvasRenderableImageElement | null) {
  const { executeCommand } = useCanvasActiveWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: CanvasImagePropertyIntent) =>
      commitCanvasImagePropertyIntent({
        executeCommand,
        imageElement: selectedImageElement,
        intent,
      }),
    [executeCommand, selectedImageElement]
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
