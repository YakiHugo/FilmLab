import { describe, expect, it } from "vitest";
import { executeCanvasCommand } from "./commands";
import { createCanvasTestDocument, createImageNode } from "./testUtils";

describe("executeCanvasCommand optional field patches", () => {
  it("clears image filmProfileId when UPDATE_NODE_PROPS sets it to undefined", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({
          id: "image-1",
          filmProfileId: "profile-1",
          x: 20,
          y: 30,
        }),
      },
      rootIds: ["image-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "UPDATE_NODE_PROPS",
      updates: [
        {
          id: "image-1",
          patch: {
            filmProfileId: undefined,
          },
        },
      ],
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
    expect(result.document.nodes["image-1"].filmProfileId).toBeUndefined();
  });
});
