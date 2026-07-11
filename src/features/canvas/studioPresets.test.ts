import { describe, expect, it } from "vitest";
import { createNeutralCanvasImageRenderState } from "@/render/image";
import type { CanvasWorkbenchSnapshot } from "@/types";
import {
  getCanvasOutputFormatBlockReason,
  resolveCanvasOutputImageId,
  resolveCanvasSemanticOverlayImageId,
} from "./studioPresets";

const createImageNode = (id: string, assetId: string) => ({
  id,
  type: "image" as const,
  assetId,
  transform: { x: 0, y: 0, width: 1080, height: 1350, rotation: 0 },
  opacity: 1,
  locked: false,
  visible: true,
  renderState: createNeutralCanvasImageRenderState(),
});

describe("canvas output preset targets", () => {
  it("keeps a grouped preferred cover as the semantic overlay target", () => {
    const document: Pick<
      CanvasWorkbenchSnapshot,
      "nodes" | "preferredCoverAssetId" | "rootIds" | "slices"
    > = {
      preferredCoverAssetId: "asset-cover",
      nodes: {
        "group-cover": {
          id: "group-cover",
          type: "group",
          name: "Cover group",
          transform: { x: 0, y: 0, width: 1080, height: 1350, rotation: 0 },
          opacity: 1,
          locked: false,
          visible: true,
        },
        "image-cover": createImageNode("image-cover", "asset-cover"),
        "image-other": createImageNode("image-other", "asset-other"),
      },
      rootIds: ["group-cover", "image-other"],
      slices: [],
    };

    expect(getCanvasOutputFormatBlockReason(document)).toBe("grouped-cover");
    expect(resolveCanvasOutputImageId(document)).toBe("image-other");
    expect(resolveCanvasSemanticOverlayImageId(document)).toBe("image-cover");
  });

  it("uses root order consistently when the preferred asset has multiple root images", () => {
    const document: Pick<CanvasWorkbenchSnapshot, "nodes" | "preferredCoverAssetId" | "rootIds"> = {
      preferredCoverAssetId: "asset-cover",
      nodes: {
        "image-a": createImageNode("image-a", "asset-cover"),
        "image-b": createImageNode("image-b", "asset-cover"),
      },
      rootIds: ["image-b", "image-a"],
    };

    expect(resolveCanvasOutputImageId(document)).toBe("image-b");
    expect(resolveCanvasSemanticOverlayImageId(document)).toBe("image-b");
  });
});
