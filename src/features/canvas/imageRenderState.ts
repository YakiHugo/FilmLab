import type { CanvasImageElement, CanvasPersistedImageElement } from "@/types";
import type { CanvasImageRenderStateV1 } from "@/render/image";

type CanvasImageRenderStateSource = Pick<
  CanvasImageElement | CanvasPersistedImageElement,
  "renderState"
>;

export const resolveCanvasImageRenderState = (
  element: CanvasImageRenderStateSource,
  draftRenderState?: CanvasImageRenderStateV1
): CanvasImageRenderStateV1 => draftRenderState ?? element.renderState;
