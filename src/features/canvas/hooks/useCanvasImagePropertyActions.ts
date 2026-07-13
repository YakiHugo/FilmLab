import { useCallback } from "react";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { CanvasCommand, CanvasWorkbench } from "@/types";
import type { CanvasImageEditTarget } from "../editPanelSelection";
import {
  planCanvasImagePropertyCommand,
  type CanvasImagePropertyIntent,
} from "../image/imagePropertyState";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";

interface CommitCanvasImagePropertyIntentOptions {
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<CanvasWorkbench | null>;
  imageElement: CanvasImageEditTarget | null;
  intent: CanvasImagePropertyIntent;
}

export const commitCanvasImagePropertyIntent = async ({
  executeCommand,
  imageElement,
  intent,
}: CommitCanvasImagePropertyIntentOptions) => {
  if (!imageElement) {
    return null;
  }

  const command = planCanvasImagePropertyCommand({
    intent,
    node: imageElement,
  });
  if (!command) {
    return null;
  }

  return executeCommand(command);
};

export function useCanvasImagePropertyActions(selectedImageElement: CanvasImageEditTarget | null) {
  const { executeCommand } = useCanvasLoadedWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: CanvasImagePropertyIntent) =>
      commitCanvasImagePropertyIntent({
        executeCommand,
        imageElement: selectedImageElement,
        intent,
      }),
    [executeCommand, selectedImageElement]
  );

  const setRenderState = useCallback(
    (value: CanvasImageRenderStateV1) => commitIntent({ type: "set-image-render-state", value }),
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
    setRenderState,
    setFilmProfileId,
  };
}
