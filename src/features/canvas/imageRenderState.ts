import type {
  CanvasEditableImageElement,
  CanvasImageElement,
  CanvasPersistedImageElement,
} from "@/types";
import type { CanvasImageRenderStateV1 } from "@/render/image";

type CanvasImageRenderStateSource = Pick<
  CanvasImageElement | CanvasPersistedImageElement,
  "renderState"
>;

export const resolveCanvasImageRenderState = (
  element: CanvasImageRenderStateSource,
  _asset?: unknown,
  draftRenderState?: CanvasImageRenderStateV1
) => draftRenderState ?? element.renderState ?? null;

export const resolveCanvasImageRenderStateForMutation = (
  element: CanvasImageRenderStateSource
) => element.renderState ?? null;

export const canonicalizeCanvasImageNode = <
  T extends CanvasEditableImageElement | CanvasPersistedImageElement,
>(
  element: T
): T => {
  if (element.renderState) {
    return element;
  }
  throw new Error(`Canvas image node ${element.id} is missing renderState.`);
};
