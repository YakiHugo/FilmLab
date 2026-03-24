import type {
  CanvasCommand,
  CanvasRenderableElement,
  EditingAdjustments,
} from "@/types";

export type CanvasImagePropertyIntent =
  | { type: "set-image-adjustments"; value: EditingAdjustments | undefined }
  | { type: "set-image-film-profile"; value: string | undefined };

export type CanvasImagePropertyCommand =
  | Extract<CanvasCommand, { type: "APPLY_IMAGE_ADJUSTMENTS" }>
  | Extract<CanvasCommand, { type: "UPDATE_NODE_PROPS" }>;

type CanvasRenderableImageElement = Extract<CanvasRenderableElement, { type: "image" }>;

export const isCanvasImagePropertyIntent = (
  intent: { type: string }
): intent is CanvasImagePropertyIntent =>
  intent.type === "set-image-adjustments" || intent.type === "set-image-film-profile";

export const planCanvasImagePropertyCommand = ({
  intent,
  node,
}: {
  intent: CanvasImagePropertyIntent;
  node: CanvasRenderableElement | null;
}): CanvasImagePropertyCommand | null => {
  if (node?.type !== "image") {
    return null;
  }

  return resolveCanvasImagePropertyCommand(intent, node);
};

const resolveCanvasImagePropertyCommand = (
  intent: CanvasImagePropertyIntent,
  node: CanvasRenderableImageElement
): CanvasImagePropertyCommand => {
  switch (intent.type) {
    case "set-image-adjustments":
      return {
        type: "APPLY_IMAGE_ADJUSTMENTS",
        adjustments: intent.value,
        id: node.id,
      };
    case "set-image-film-profile":
      return {
        type: "UPDATE_NODE_PROPS",
        updates: [
          {
            id: node.id,
            patch: {
              filmProfileId: intent.value,
            },
          },
        ],
      };
  }
};
