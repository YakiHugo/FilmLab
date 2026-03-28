import { getBuiltInFilmProfile } from "@/lib/film";
import {
  type CanvasImageRenderStateV1,
} from "@/render/image";
import type { Asset } from "@/types";
import type {
  CanvasCommand,
  CanvasPersistedImageElement,
  CanvasRenderableElement,
} from "@/types";
import { resolveCanvasImageRenderStateForMutation } from "./imageRenderState";

export type CanvasImagePropertyIntent =
  | { type: "set-image-render-state"; value: CanvasImageRenderStateV1 }
  | { type: "set-image-film-profile"; value: string | undefined };

export type CanvasImagePropertyCommand = Extract<CanvasCommand, { type: "SET_IMAGE_RENDER_STATE" }>;

type CanvasImagePropertyTarget =
  | CanvasRenderableElement
  | (Pick<
      CanvasPersistedImageElement,
      "id" | "type" | "renderState" | "adjustments" | "filmProfileId"
    > & {
      asset?: Asset | null;
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
  node: CanvasImagePropertyTarget
): CanvasImagePropertyCommand | null => {
  const baseRenderState =
    resolveCanvasImageRenderStateForMutation(node, "asset" in node ? node.asset : null) ??
    node.renderState ??
    null;

  switch (intent.type) {
    case "set-image-render-state":
      return {
        type: "SET_IMAGE_RENDER_STATE",
        renderState: intent.value,
        id: node.id,
      };
    case "set-image-film-profile":
      if (!baseRenderState) {
        return null;
      }
      return {
        type: "SET_IMAGE_RENDER_STATE",
        id: node.id,
        renderState: {
          ...baseRenderState,
          film: {
            ...(baseRenderState.film ?? {
              profile: undefined,
              profileId: null,
              profileOverrides: null,
            }),
            profileId: intent.value ?? null,
            profile: intent.value ? getBuiltInFilmProfile(intent.value) ?? undefined : undefined,
          },
        } as CanvasImageRenderStateV1,
      };
  }
};
