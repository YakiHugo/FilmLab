import { useCallback } from "react";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { Asset, CanvasCommand } from "@/types";
import type { CanvasImageEditTarget } from "../editPanelSelection";
import {
  planCanvasImagePropertyCommand,
  type CanvasImagePropertyIntent,
} from "../imagePropertyState";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";

interface CommitCanvasImagePropertyIntentOptions {
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
  imageAsset?: Asset | null;
  imageElement: CanvasImageEditTarget | null;
  intent: CanvasImagePropertyIntent;
}

export const commitCanvasImagePropertyIntent = async ({
  executeCommand,
  imageAsset,
  imageElement,
  intent,
}: CommitCanvasImagePropertyIntentOptions) => {
  if (!imageElement) {
    return;
  }

  const command = planCanvasImagePropertyCommand({
    intent,
    node: imageElement ? { ...imageElement, asset: imageAsset } : null,
  });
  if (!command) {
    return;
  }

  await executeCommand(command);
};

export function useCanvasImagePropertyActions(
  selectedImageElement: CanvasImageEditTarget | null,
  selectedImageAsset?: Asset | null
) {
  const { executeCommand } = useCanvasLoadedWorkbenchCommands();

  const commitIntent = useCallback(
    (intent: CanvasImagePropertyIntent) =>
      commitCanvasImagePropertyIntent({
        executeCommand,
        imageAsset: selectedImageAsset,
        imageElement: selectedImageElement,
        intent,
      }),
    [executeCommand, selectedImageAsset, selectedImageElement]
  );

  const setRenderState = useCallback(
    (value: CanvasImageRenderStateV1) =>
      commitIntent({ type: "set-image-render-state", value }),
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
