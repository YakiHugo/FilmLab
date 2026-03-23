import { describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createCanvasTestDocument, createImageNode } from "../document/testUtils";
import { commitCanvasImagePropertyIntent } from "./useCanvasImagePropertyActions";

describe("useCanvasImagePropertyActions", () => {
  it("commits image adjustments through APPLY_IMAGE_ADJUSTMENTS", async () => {
    const executeCommandInWorkbench = vi.fn().mockResolvedValue(null);
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
      activeWorkbenchId: workbench.id,
      executeCommandInWorkbench,
      imageElement,
      intent: { type: "set-image-adjustments", value: adjustments },
    });

    expect(executeCommandInWorkbench).toHaveBeenCalledWith(workbench.id, {
      type: "APPLY_IMAGE_ADJUSTMENTS",
      adjustments,
      id: "image-1",
    });
  });

  it("commits film profile changes through UPDATE_NODE_PROPS", async () => {
    const executeCommandInWorkbench = vi.fn().mockResolvedValue(null);
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
      activeWorkbenchId: workbench.id,
      executeCommandInWorkbench,
      imageElement,
      intent: { type: "set-image-film-profile", value: "film-portrait-soft-v1" },
    });

    expect(executeCommandInWorkbench).toHaveBeenCalledWith(workbench.id, {
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

  it("does nothing when the image selection or active workbench is missing", async () => {
    const executeCommandInWorkbench = vi.fn().mockResolvedValue(null);

    await commitCanvasImagePropertyIntent({
      activeWorkbenchId: null,
      executeCommandInWorkbench,
      imageElement: null,
      intent: { type: "set-image-film-profile", value: "film-portrait-soft-v1" },
    });

    expect(executeCommandInWorkbench).not.toHaveBeenCalled();
  });
});
