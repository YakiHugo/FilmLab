import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { executeCanvasCommand } from "./commands";
import { createCanvasTestDocument } from "./testUtils";

describe("executeCanvasCommand optional field patches", () => {
  it("clears legacy image fields when SET_IMAGE_RENDER_STATE commits canonical state", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "image-1": {
          id: "image-1",
          type: "image",
          parentId: null,
          assetId: "asset-1",
          filmProfileId: "profile-1",
          adjustments: undefined,
          x: 20,
          y: 30,
          width: 120,
          height: 80,
          rotation: 0,
          transform: {
            x: 20,
            y: 30,
            width: 120,
            height: 80,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
          zIndex: 1,
        },
      },
      rootIds: ["image-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "SET_IMAGE_RENDER_STATE",
      id: "image-1",
      renderState: createDefaultCanvasImageRenderState(),
    });

    expect(result.didChange).toBe(true);
    expect(result.document.nodes["image-1"]).toMatchObject({
      id: "image-1",
      type: "image",
    });
    expect(result.document.nodes["image-1"]?.type).toBe("image");
    if (result.document.nodes["image-1"]?.type !== "image") {
      throw new Error("expected image node");
    }
    expect(result.document.nodes["image-1"].adjustments).toBeUndefined();
    expect(result.document.nodes["image-1"].filmProfileId).toBeUndefined();
    expect(result.document.nodes["image-1"].renderState).toBeDefined();
  });
});
