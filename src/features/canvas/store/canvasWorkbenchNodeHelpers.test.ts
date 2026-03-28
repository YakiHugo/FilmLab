import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { cloneNodeTree } from "./canvasWorkbenchNodeHelpers";

describe("canvasWorkbenchNodeHelpers", () => {
  it("canonicalizes duplicated legacy image nodes into renderState-backed nodes", () => {
    const assetAdjustments = createDefaultAdjustments();
    assetAdjustments.exposure = 17;
    const workbench = normalizeCanvasWorkbench({
      id: "doc-1",
      version: 4,
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
          adjustments: undefined,
          filmProfileId: "film-portrait-soft-v1",
          x: 40,
          y: 60,
          width: 320,
          height: 240,
          rotation: 0,
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
      null,
      undefined,
      new Map([
        [
          "asset-1",
          {
            id: "asset-1",
            name: "asset-1.jpg",
            type: "image/jpeg",
            size: 1024,
            createdAt: "2026-03-28T00:00:00.000Z",
            objectUrl: "blob:asset-1",
            adjustments: assetAdjustments,
            filmProfileId: "film-portrait-soft-v1",
            layers: [],
          },
        ],
      ])
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
    expect(clone.adjustments).toBeUndefined();
    expect(clone.filmProfileId).toBeUndefined();
  });

  it("preserves unresolved legacy image fields when the source asset is unavailable", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 17;
    const workbench = normalizeCanvasWorkbench({
      id: "doc-1",
      version: 4,
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
          assetId: "asset-missing",
          adjustments,
          filmProfileId: "film-portrait-soft-v1",
          x: 40,
          y: 60,
          width: 320,
          height: 240,
          rotation: 0,
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
    expect(clone.renderState).toBeUndefined();
    expect(clone.adjustments).toMatchObject({
      exposure: 17,
    });
    expect(clone.filmProfileId).toBe("film-portrait-soft-v1");
  });
});
