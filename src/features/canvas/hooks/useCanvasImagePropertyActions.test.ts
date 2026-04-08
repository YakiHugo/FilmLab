import { describe, expect, it, vi } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { createCanvasTestDocument, createImageNode } from "../document/testUtils";
import { commitCanvasImagePropertyIntent } from "./useCanvasImagePropertyActions";

describe("useCanvasImagePropertyActions", () => {
  it("commits image render state through SET_IMAGE_RENDER_STATE", async () => {
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

    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.tone.exposure = 18;

    await commitCanvasImagePropertyIntent({
      executeCommand,
      imageElement,
      intent: { type: "set-image-render-state", value: renderState },
    });

    expect(executeCommand).toHaveBeenCalledWith({
      type: "SET_IMAGE_RENDER_STATE",
      renderState,
      id: "image-1",
    });
  });

  it("commits film profile changes through SET_IMAGE_RENDER_STATE", async () => {
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

    expect(executeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_IMAGE_RENDER_STATE",
        id: "image-1",
        renderState: expect.objectContaining({
          film: expect.objectContaining({
            profileId: "film-portrait-soft-v1",
          }),
        }),
      })
    );
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

  it("rejects film-profile updates for image selections missing renderState", async () => {
    const executeCommand = vi.fn().mockResolvedValue(null);
    const imageElement = {
      id: "image-legacy",
      type: "image" as const,
      assetId: "asset-1",
      renderState: undefined,
    };

    await commitCanvasImagePropertyIntent({
      executeCommand,
      imageElement,
      intent: { type: "set-image-film-profile", value: "film-portrait-soft-v1" },
    });

    expect(executeCommand).not.toHaveBeenCalled();
  });
});
