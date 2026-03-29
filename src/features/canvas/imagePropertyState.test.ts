import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { createCanvasTestDocument, createImageNode, createShapeNode } from "./document/testUtils";
import { planCanvasImagePropertyCommand } from "./imagePropertyState";

describe("imagePropertyState", () => {
  it("emits SET_IMAGE_RENDER_STATE for image adjustment commits", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 30 }),
      },
      rootIds: ["image-1"],
    });
    const node = workbench.elements.find((entry) => entry.id === "image-1") ?? null;
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.tone.exposure = 24;

    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-render-state", value: renderState },
      node,
    });

    expect(command).toEqual({
      type: "SET_IMAGE_RENDER_STATE",
      renderState,
      id: "image-1",
    });
  });

  it("emits SET_IMAGE_RENDER_STATE for image film profile changes", () => {
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

    expect(command).toMatchObject({
      type: "SET_IMAGE_RENDER_STATE",
      id: "image-1",
      renderState: {
        film: {
          profileId: "profile-1",
        },
      },
    });
  });

  it("rejects film-profile mutations for image nodes missing renderState", () => {
    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-film-profile", value: "profile-1" },
      node: {
        id: "image-legacy",
        type: "image",
        renderState: undefined,
      },
    });

    expect(command).toBeNull();
  });

  it("rejects lossy film-profile mutations for unresolved legacy image nodes", () => {
    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-film-profile", value: "profile-1" },
      node: {
        id: "image-legacy",
        type: "image",
        renderState: undefined,
      },
    });

    expect(command).toBeNull();
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
