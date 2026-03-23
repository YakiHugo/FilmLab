import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createCanvasTestDocument, createImageNode, createShapeNode } from "./document/testUtils";
import { planCanvasImagePropertyCommand } from "./imagePropertyState";

describe("imagePropertyState", () => {
  it("emits APPLY_IMAGE_ADJUSTMENTS for image adjustment commits", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 30 }),
      },
      rootIds: ["image-1"],
    });
    const node = workbench.elements.find((entry) => entry.id === "image-1") ?? null;
    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 24;

    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-adjustments", value: adjustments },
      node,
    });

    expect(command).toEqual({
      type: "APPLY_IMAGE_ADJUSTMENTS",
      adjustments,
      id: "image-1",
    });
  });

  it("emits UPDATE_NODE_PROPS for image film profile changes", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 30 }),
      },
      rootIds: ["image-1"],
    });
    const node = workbench.elements.find((entry) => entry.id === "image-1") ?? null;

    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-film-profile", value: "profile-1" },
      node,
    });

    expect(command).toEqual({
      type: "UPDATE_NODE_PROPS",
      updates: [
        {
          id: "image-1",
          patch: {
            filmProfileId: "profile-1",
          },
        },
      ],
    });
  });

  it("rejects image-only intents for non-image nodes", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 0, y: 0 }),
      },
      rootIds: ["shape-1"],
    });
    const node = workbench.elements.find((entry) => entry.id === "shape-1") ?? null;

    expect(
      planCanvasImagePropertyCommand({
        intent: { type: "set-image-film-profile", value: "profile-1" },
        node,
      })
    ).toBeNull();
  });
});
