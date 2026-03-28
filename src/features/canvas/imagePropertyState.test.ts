import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { createDefaultAdjustments } from "@/lib/adjustments";
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

  it("uses the real asset defaults when canonicalizing a legacy image node", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 32;
    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-film-profile", value: "profile-1" },
      node: {
        id: "image-legacy",
        type: "image",
        renderState: undefined,
        adjustments: undefined,
        filmProfileId: undefined,
        asset: {
          id: "asset-1",
          name: "asset-1.jpg",
          type: "image/jpeg",
          size: 1024,
          createdAt: "2026-03-28T00:00:00.000Z",
          objectUrl: "blob:asset-1",
          adjustments,
          filmOverrides: {
            halation: {
              amount: 21,
            },
          },
          layers: [],
        },
      },
    });

    expect(command).toMatchObject({
      type: "SET_IMAGE_RENDER_STATE",
      id: "image-legacy",
      renderState: {
        develop: {
          tone: {
            exposure: 32,
          },
        },
        film: {
          profileId: "profile-1",
          profileOverrides: {
            halation: {
              amount: 21,
            },
          },
        },
      },
    });
  });

  it("rejects lossy film-profile mutations for unresolved legacy image nodes", () => {
    const command = planCanvasImagePropertyCommand({
      intent: { type: "set-image-film-profile", value: "profile-1" },
      node: {
        id: "image-legacy",
        type: "image",
        renderState: undefined,
        adjustments: createDefaultAdjustments(),
        filmProfileId: "film-portrait-soft-v1",
        asset: null,
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
