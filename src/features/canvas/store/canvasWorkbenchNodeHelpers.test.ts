import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { cloneNodeTree } from "./canvasWorkbenchNodeHelpers";

describe("canvasWorkbenchNodeHelpers", () => {
  it("duplicates renderState-backed image nodes without reintroducing legacy fields", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.tone.exposure = 17;
    renderState.film.profileId = "film-portrait-soft-v1";
    const workbench = normalizeCanvasWorkbench({
      id: "doc-1",
      version: 5,
      ownerRef: { userId: "user-1" },
      name: "Workbench",
      width: 1200,
      height: 800,
      presetId: "custom",
      backgroundColor: "#050505",
      nodes: {
        "image-1": {
          id: "image-1",
          type: "image",
          parentId: null,
          assetId: "asset-1",
          renderState,
          transform: {
            x: 40,
            y: 60,
            width: 320,
            height: 240,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
          zIndex: 1,
        },
      },
      rootIds: ["image-1"],
      groupChildren: {},
      slices: [],
      guides: {
        showCenter: false,
        showThirds: false,
        showSafeArea: false,
      },
      safeArea: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-28T00:00:00.000Z",
    });

    const clones = cloneNodeTree(
      workbench,
      "image-1",
      { x: 12, y: 18 },
      new Set(workbench.allNodes.map((node) => node.id)),
      null
    );
    const clone = clones[0];

    expect(clone?.type).toBe("image");
    if (!clone || clone.type !== "image") {
      throw new Error("Expected image clone.");
    }
    expect(clone.renderState).toMatchObject({
      develop: {
        tone: {
          exposure: 17,
        },
      },
      film: {
        profileId: "film-portrait-soft-v1",
      },
    });
  });
});
