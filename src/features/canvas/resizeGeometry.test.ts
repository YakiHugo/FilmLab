import { describe, expect, it } from "vitest";
import type { CanvasTextElement } from "@/types";
import { worldPointToLocalPoint } from "./documentGraph";
import {
  createCanvasTestDocument,
  createGroupNode,
  createImageNode,
  createShapeNode,
} from "./document/testUtils";
import {
  applyCanvasResizePreviewToElement,
  constrainCanvasResizeBoxToAspectRatio,
  createCanvasResizePreviewFromElement,
  resolveMinimumCanvasImageDimensions,
  planCanvasElementResize,
} from "./resizeGeometry";
import { fitCanvasTextElementToContent } from "./textStyle";

const createTextNode = ({
  id,
  x,
  y,
  content = "Hello FilmLab",
  fontSize = 24,
  fontSizeTier = "small" as const,
}: {
  content?: string;
  fontSize?: number;
  fontSizeTier?: CanvasTextElement["fontSizeTier"];
  id: string;
  x: number;
  y: number;
}): CanvasTextElement => {
  const baseNode: CanvasTextElement = {
    id,
    type: "text",
    parentId: null,
    x,
    y,
    width: 1,
    height: 1,
    rotation: 0,
    transform: {
      x,
      y,
      width: 1,
      height: 1,
      rotation: 0,
    },
    opacity: 1,
    locked: false,
    visible: true,
    content,
    fontFamily: "Georgia",
    fontSize,
    fontSizeTier,
    color: "#ffffff",
    textAlign: "left",
  };

  const fitted = fitCanvasTextElementToContent(baseNode);
  return {
    ...fitted,
    transform: {
      ...baseNode.transform,
      width: fitted.width,
      height: fitted.height,
    },
  };
};

describe("resizeGeometry", () => {
  it("scales image dimensions proportionally when the transformer keeps ratio", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 40, width: 120, height: 80 }),
      },
      rootIds: ["image-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected image element.");
    }

    const plan = planCanvasElementResize({
      element,
      imageAspectRatio: 3 / 2,
      preserveImageAspectRatio: true,
      snapshot: {
        x: 30,
        y: 50,
        scaleX: 2,
        scaleY: 2,
      },
      workbench,
    });

    expect(plan.preview).toMatchObject({
      x: 30,
      y: 50,
      width: 240,
      height: 160,
    });
    expect(plan.patch).toMatchObject({
      x: 30,
      y: 50,
      width: 240,
      height: 160,
    });
  });

  it("restores image resizing to the original asset aspect ratio instead of the current box ratio", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 40, width: 120, height: 80 }),
      },
      rootIds: ["image-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected image element.");
    }

    const plan = planCanvasElementResize({
      element,
      imageAspectRatio: 2,
      preserveImageAspectRatio: true,
      snapshot: {
        x: 20,
        y: 40,
        scaleX: 2,
        scaleY: 1,
      },
      workbench,
    });

    expect(plan.patch).toMatchObject({
      width: 240,
      height: 120,
    });
  });

  it("allows image free scaling when the transformer reports unlocked axes", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 20, y: 40, width: 120, height: 80 }),
      },
      rootIds: ["image-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected image element.");
    }

    const plan = planCanvasElementResize({
      element,
      imageAspectRatio: 2,
      preserveImageAspectRatio: false,
      snapshot: {
        x: 20,
        y: 40,
        scaleX: 1.5,
        scaleY: 0.2,
      },
      workbench,
    });

    expect(plan.patch).toMatchObject({
      width: 180,
      height: 32,
    });
  });

  it("keeps the image short edge at or above 32 when aspect-locked", () => {
    expect(resolveMinimumCanvasImageDimensions(2)).toEqual({
      width: 64,
      height: 32,
    });

    expect(resolveMinimumCanvasImageDimensions(0.5)).toEqual({
      width: 32,
      height: 64,
    });
  });

  it("constrains edge-handle resize boxes to the target aspect ratio", () => {
    const constrained = constrainCanvasResizeBoxToAspectRatio({
      activeAnchor: "middle-right",
      aspectRatio: 2,
      minimumDimensions: { width: 64, height: 32 },
      oldBox: { x: 10, y: 20, width: 120, height: 80, rotation: 0 },
      newBox: { x: 10, y: 20, width: 180, height: 80, rotation: 0 },
    });

    expect(constrained).toMatchObject({
      x: 10,
      y: 15,
      width: 180,
      height: 90,
      rotation: 0,
    });
  });

  it("clamps aspect-locked image resize boxes to the 32px short-edge minimum", () => {
    const constrained = constrainCanvasResizeBoxToAspectRatio({
      activeAnchor: "bottom-right",
      aspectRatio: 2,
      minimumDimensions: { width: 64, height: 32 },
      oldBox: { x: 10, y: 20, width: 120, height: 80, rotation: 0 },
      newBox: { x: 10, y: 20, width: 20, height: 10, rotation: 0 },
    });

    expect(constrained).toMatchObject({
      x: 10,
      y: 20,
      width: 64,
      height: 32,
    });
  });

  it("scales text by font size and persists fitted dimensions", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "text-1": createTextNode({ id: "text-1", x: 10, y: 20 }),
      },
      rootIds: ["text-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "text-1");
    if (!element || element.type !== "text") {
      throw new Error("Expected text element.");
    }

    const plan = planCanvasElementResize({
      element,
      snapshot: {
        x: 18,
        y: 26,
        scaleX: 2,
        scaleY: 2,
      },
      workbench,
    });
    const expectedFitted = fitCanvasTextElementToContent({
      ...element,
      fontSize: 48,
      fontSizeTier: "large",
    });

    expect(plan.patch).toMatchObject({
      x: 18,
      y: 26,
      fontSize: 48,
      fontSizeTier: "large",
      width: expectedFitted.width,
      height: expectedFitted.height,
    });
  });

  it("updates rect and ellipse patches with scaled stroke and radius", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": {
          ...createShapeNode({ id: "shape-1", x: 0, y: 0, width: 120, height: 80 }),
          radius: 10,
          strokeWidth: 2,
        },
      },
      rootIds: ["shape-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "shape-1");
    if (!element || element.type !== "shape") {
      throw new Error("Expected shape element.");
    }

    const plan = planCanvasElementResize({
      element,
      snapshot: {
        x: 5,
        y: 8,
        scaleX: 2,
        scaleY: 0.5,
      },
      workbench,
    });

    expect(plan.patch).toMatchObject({
      x: 5,
      y: 8,
      width: 240,
      height: 40,
      radius: 5,
      strokeWidth: 2,
    });
  });

  it("rescales line and arrow points for persisted shape geometry", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": {
          ...createShapeNode({ id: "shape-1", x: 10, y: 20, width: 120, height: 80 }),
          shapeType: "arrow",
          strokeWidth: 2,
          points: [
            { x: 0, y: 40 },
            { x: 120, y: 40 },
          ],
          arrowHead: { start: false, end: true },
        },
      },
      rootIds: ["shape-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "shape-1");
    if (!element || element.type !== "shape") {
      throw new Error("Expected shape element.");
    }

    const plan = planCanvasElementResize({
      element,
      snapshot: {
        x: 10,
        y: 20,
        scaleX: 1.5,
        scaleY: 0.5,
      },
      workbench,
    });

    expect(plan.patch).toMatchObject({
      width: 180,
      height: 40,
      strokeWidth: 1.732,
      points: [
        { x: 0, y: 20 },
        { x: 180, y: 20 },
      ],
    });
  });

  it("applies shape resize preview data to runtime render props", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": {
          ...createShapeNode({ id: "shape-1", x: 10, y: 20, width: 120, height: 80 }),
          shapeType: "arrow",
          strokeWidth: 2,
          points: [
            { x: 0, y: 40 },
            { x: 120, y: 40 },
          ],
          arrowHead: { start: false, end: true },
        },
      },
      rootIds: ["shape-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "shape-1");
    if (!element || element.type !== "shape") {
      throw new Error("Expected shape element.");
    }

    const previewElement = applyCanvasResizePreviewToElement(element, {
      x: 30,
      y: 40,
      width: 180,
      height: 50,
      strokeWidth: 3,
      points: [
        { x: 0, y: 25 },
        { x: 180, y: 25 },
      ],
    });

    expect(previewElement).toMatchObject({
      x: 30,
      y: 40,
      width: 180,
      height: 50,
      strokeWidth: 3,
      points: [
        { x: 0, y: 25 },
        { x: 180, y: 25 },
      ],
      transform: {
        x: 30,
        y: 40,
        width: 180,
        height: 50,
      },
    });
  });

  it("creates a resize preview snapshot from the current renderable element", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": {
          ...createShapeNode({ id: "shape-1", x: 10, y: 20, width: 120, height: 80 }),
          shapeType: "rect",
          radius: 12,
          strokeWidth: 3,
        },
      },
      rootIds: ["shape-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "shape-1");
    if (!element || element.type !== "shape") {
      throw new Error("Expected shape element.");
    }

    expect(createCanvasResizePreviewFromElement(element)).toMatchObject({
      x: 10,
      y: 20,
      width: 120,
      height: 80,
      radius: 12,
      strokeWidth: 3,
    });
  });

  it("converts resized grouped node positions back into local coordinates", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 100,
          y: 50,
          rotation: 90,
          childIds: ["image-1"],
        }),
        "image-1": createImageNode({
          id: "image-1",
          parentId: "group-1",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
        }),
      },
      rootIds: ["group-1"],
    });
    const element = workbench.elements.find((entry) => entry.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected grouped image element.");
    }

    const plan = planCanvasElementResize({
      element,
      imageAspectRatio: 3 / 2,
      preserveImageAspectRatio: true,
      snapshot: {
        x: 140,
        y: 130,
        scaleX: 1.25,
        scaleY: 1.25,
      },
      workbench,
    });
    const expectedLocalPosition = worldPointToLocalPoint(workbench, "group-1", {
      x: 140,
      y: 130,
    });

    expect(plan.patch).toMatchObject({
      x: expectedLocalPosition.x,
      y: expectedLocalPosition.y,
      width: 150,
      height: 100,
    });
  });
});
