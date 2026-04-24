import { getBuiltInFilmProfile } from "@/lib/film";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type {
  CanvasCommand,
  CanvasPersistedImageElement,
  CanvasRenderableElement,
} from "@/types";

export type CanvasImagePropertyIntent =
  | { type: "set-image-render-state"; value: CanvasImageRenderStateV1 }
  | { type: "set-image-film-profile"; value: string | undefined };

export type CanvasImagePropertyCommand = Extract<CanvasCommand, { type: "SET_IMAGE_RENDER_STATE" }>;

type CanvasImagePropertyTarget =
  | CanvasRenderableElement
  | Pick<CanvasPersistedImageElement, "id" | "type" | "renderState">;

type CanvasImagePropertyImageTarget =
  | Extract<CanvasRenderableElement, { type: "image" }>
  | (Pick<CanvasPersistedImageElement, "id" | "type" | "renderState"> & {
      type: "image";
    });

export const isCanvasImagePropertyIntent = (
  intent: { type: string }
): intent is CanvasImagePropertyIntent =>
  intent.type === "set-image-render-state" || intent.type === "set-image-film-profile";

export const planCanvasImagePropertyCommand = ({
  intent,
  node,
}: {
  intent: CanvasImagePropertyIntent;
  node: CanvasImagePropertyTarget | null;
}): CanvasImagePropertyCommand | null => {
  if (node?.type !== "image") {
    return null;
  }

  return resolveCanvasImagePropertyCommand(intent, node);
};

const resolveCanvasImagePropertyCommand = (
  intent: CanvasImagePropertyIntent,
  node: CanvasImagePropertyImageTarget
): CanvasImagePropertyCommand => {
  switch (intent.type) {
    case "set-image-render-state":
      return {
        type: "SET_IMAGE_RENDER_STATE",
        renderState: intent.value,
        id: node.id,
      };
    case "set-image-film-profile":
      return {
        type: "SET_IMAGE_RENDER_STATE",
        id: node.id,
        renderState: {
          ...node.renderState,
          film: {
            ...node.renderState.film,
            profileId: intent.value ?? null,
            profile: intent.value ? getBuiltInFilmProfile(intent.value) ?? undefined : undefined,
          },
        },
      };
  }
};
