import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { createCanvasTestDocument, createGroupNode, createImageNode, createShapeNode } from "./document/testUtils";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetForElementId,
  resolveCanvasEditTargetFromPrimarySelection,
  resolveCanvasEditableElementKeyFromPrimarySelection,
  shouldOpenCanvasEditPanelForElement,
} from "./editPanelSelection";

describe("edit panel selection", () => {
  it("resolves an edit target only when the primary selected element is editable", () => {
    const document = createCanvasTestDocument({
      nodes: {
        group: createGroupNode({
          id: "group",
          x: 0,
          y: 0,
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 24,
          y: 36,
        }),
        "image-1": createImageNode({
          id: "image-1",
          x: 120,
          y: 80,
          width: 180,
          height: 120,
        }),
      },
      rootIds: ["group", "shape-1", "image-1"],
    });

    expect(resolveCanvasEditTargetFromPrimarySelection(document, "group")).toBeNull();
    expect(resolveCanvasEditTargetForElementId(document, "group")).toBeNull();
    expect(resolveCanvasEditableElementKeyFromPrimarySelection(document, "group")).toBeNull();
    expect(resolveCanvasEditTargetFromPrimarySelection(document, "shape-1")).toMatchObject({
      id: "shape-1",
      type: "shape",
    });
    expect(resolveCanvasEditableElementKeyFromPrimarySelection(document, "image-1")).toBe(
      "image:image-1"
    );
  });

  it("opens the edit panel only for direct non-additive image or shape activation", () => {
    const document = createCanvasTestDocument({
      nodes: {
        group: createGroupNode({
          id: "group",
          x: 0,
          y: 0,
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 24,
          y: 36,
        }),
        "image-1": createImageNode({
          id: "image-1",
          x: 120,
          y: 80,
          width: 180,
          height: 120,
        }),
      },
      rootIds: ["group", "shape-1", "image-1"],
    });

    expect(
      shouldOpenCanvasEditPanelForElement({
        activeWorkbench: document,
        elementId: "image-1",
      })
    ).toBe(true);
    expect(
      shouldOpenCanvasEditPanelForElement({
        activeWorkbench: document,
        elementId: "shape-1",
      })
    ).toBe(true);
    expect(
      shouldOpenCanvasEditPanelForElement({
        activeWorkbench: document,
        additive: true,
        elementId: "shape-1",
      })
    ).toBe(false);
    expect(
      shouldOpenCanvasEditPanelForElement({
        activeWorkbench: document,
        elementId: "group",
      })
    ).toBe(false);
    expect(
      shouldOpenCanvasEditPanelForElement({
        activeWorkbench: null,
        elementId: "image-1",
      })
    ).toBe(false);
  });

  it("compares only edit-relevant target fields", () => {
    const imageRenderState = createDefaultCanvasImageRenderState();

    expect(
      canvasEditTargetEqual(
        {
          id: "image-1",
          type: "image",
          assetId: "asset-1",
          renderState: imageRenderState,
        },
        {
          id: "image-1",
          type: "image",
          assetId: "asset-1",
          renderState: imageRenderState,
        }
      )
    ).toBe(true);

    expect(
      canvasEditTargetEqual(
        {
          id: "shape-1",
          type: "shape",
          shapeType: "rect",
          fill: "#111111",
          fillStyle: {
            kind: "linear-gradient",
            angle: 45,
            from: "#111111",
            to: "#ffffff",
          },
          stroke: "#222222",
          strokeWidth: 2,
          opacity: 0.8,
        },
        {
          id: "shape-1",
          type: "shape",
          shapeType: "rect",
          fill: "#111111",
          fillStyle: {
            kind: "linear-gradient",
            angle: 45,
            from: "#111111",
            to: "#ffffff",
          },
          stroke: "#222222",
          strokeWidth: 2,
          opacity: 0.8,
        }
      )
    ).toBe(true);

    expect(
      canvasEditTargetEqual(
        {
          id: "shape-1",
          type: "shape",
          shapeType: "rect",
          fill: "#111111",
          fillStyle: {
            kind: "solid",
            color: "#111111",
          },
          stroke: "#222222",
          strokeWidth: 2,
          opacity: 0.8,
        },
        {
          id: "shape-1",
          type: "shape",
          shapeType: "rect",
          fill: "#111111",
          fillStyle: {
            kind: "solid",
            color: "#333333",
          },
          stroke: "#222222",
          strokeWidth: 2,
          opacity: 0.8,
        }
      )
    ).toBe(false);
  });
});
