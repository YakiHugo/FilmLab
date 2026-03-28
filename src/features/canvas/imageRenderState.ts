import { legacyEditingAdjustmentsToCanvasImageRenderState } from "@/render/image";
import type {
  Asset,
  CanvasEditableImageElement,
  CanvasImageElement,
  CanvasPersistedImageElement,
} from "@/types";
import type { CanvasImageRenderStateV1 } from "@/render/image";

type CanvasImageRenderStateSource = Pick<
  CanvasImageElement | CanvasPersistedImageElement,
  "adjustments" | "filmProfileId" | "renderState"
>;

const resolveLegacyCanvasImageRenderState = (
  element: CanvasImageRenderStateSource,
  asset?: Asset | null
) => {
  if (element.renderState) {
    return element.renderState;
  }

  if (asset) {
    return legacyEditingAdjustmentsToCanvasImageRenderState({
      asset,
      adjustments: element.adjustments,
      filmProfileId: element.filmProfileId,
    });
  }
  return null;
};

export const resolveCanvasImageRenderState = (
  element: CanvasImageRenderStateSource,
  asset?: Asset | null,
  draftRenderState?: CanvasImageRenderStateV1
) =>
  draftRenderState ?? resolveLegacyCanvasImageRenderState(element, asset);

export const resolveCanvasImageRenderStateForMutation = (
  element: CanvasImageRenderStateSource,
  asset?: Asset | null
) => resolveLegacyCanvasImageRenderState(element, asset);

export const canonicalizeCanvasImageNode = <
  T extends CanvasEditableImageElement | CanvasPersistedImageElement,
>(
  element: T,
  asset?: Asset | null
): T => {
  if (
    element.renderState &&
    element.adjustments === undefined &&
    element.filmProfileId === undefined
  ) {
    return element;
  }

  const renderState = resolveLegacyCanvasImageRenderState(element, asset);

  if (!renderState) {
    return element;
  }

  return {
    ...element,
    adjustments: undefined,
    filmProfileId: undefined,
    renderState,
  };
};
