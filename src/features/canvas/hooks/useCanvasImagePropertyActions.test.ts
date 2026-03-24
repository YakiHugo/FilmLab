import { describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createCanvasTestDocument, createImageNode } from "../document/testUtils";
import { commitCanvasImagePropertyIntent } from "./useCanvasImagePropertyActions";

describe("useCanvasImagePropertyActions", () => {
  it("commits image adjustments through APPLY_IMAGE_ADJUSTMENTS", async () => {
    const executeCommand = vi.fn().mockResolvedValue(null);
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 32, y: 48 }),
      },
      rootIds: ["image-1"],
    });
    const imageElement = workbench.elements.find((entry) => entry.id === "image-1");
    if (!imageElement || imageElement.type !== "image") {
      throw new Error("Expected image element.");
    }

    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 18;

    await commitCanvasImagePropertyIntent({
      executeCommand,
      imageElement,
      intent: { type: "set-image-adjustments", value: adjustments },
    });

    expect(executeCommand).toHaveBeenCalledWith({
      type: "APPLY_IMAGE_ADJUSTMENTS",
      adjustments,
      id: "image-1",
    });
  });

  it("commits film profile changes through UPDATE_NODE_PROPS", async () => {
    const executeCommand = vi.fn().mockResolvedValue(null);
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 32, y: 48 }),
      },
      rootIds: ["image-1"],
    });
    const imageElement = workbench.elements.find((entry) => entry.id === "image-1");
    if (!imageElement || imageElement.type !== "image") {
      throw new Error("Expected image element.");
    }

    await commitCanvasImagePropertyIntent({
      executeCommand,
      imageElement,
      intent: { type: "set-image-film-profile", value: "film-portrait-soft-v1" },
    });

    expect(executeCommand).toHaveBeenCalledWith({
      type: "UPDATE_NODE_PROPS",
      updates: [
        {
          id: "image-1",
          patch: {
            filmProfileId: "film-portrait-soft-v1",
          },
        },
      ],
    });
  });

  it("does nothing when the image selection is missing", async () => {
    const executeCommand = vi.fn().mockResolvedValue(null);

    await commitCanvasImagePropertyIntent({
      executeCommand,
      imageElement: null,
      intent: { type: "set-image-film-profile", value: "film-portrait-soft-v1" },
    });

    expect(executeCommand).not.toHaveBeenCalled();
  });
});
