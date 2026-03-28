import { legacyEditingAdjustmentsToCanvasImageRenderState } from "@/render/image";
import type { Asset, CanvasImageElement } from "@/types";
import { createId } from "@/utils";

export const createCanvasImageElementFromAsset = ({
  asset,
  height,
  id = createId("node-id"),
  width,
  x,
  y,
}: {
  asset: Asset;
  height: number;
  id?: string;
  width: number;
  x: number;
  y: number;
}): CanvasImageElement => ({
  id,
  type: "image",
  parentId: null,
  assetId: asset.id,
  x,
  y,
  width,
  height,
  rotation: 0,
  transform: {
    x,
    y,
    width,
    height,
    rotation: 0,
  },
  opacity: 1,
  locked: false,
  visible: true,
  renderState: legacyEditingAdjustmentsToCanvasImageRenderState({
    asset,
  }),
});
