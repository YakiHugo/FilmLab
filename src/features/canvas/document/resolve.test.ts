import { describe, expect, it } from "vitest";
import { createCanvasTestDocument, createGroupNode, createShapeNode } from "./testUtils";

describe("document resolve", () => {
  it("derives effective visibility, lock, opacity, and paint order from the tree", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 40,
          y: 60,
          opacity: 0.5,
          locked: true,
          visible: false,
          childIds: ["shape-1", "shape-2"],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 10,
          y: 20,
          opacity: 0.8,
        }),
        "shape-2": createShapeNode({
          id: "shape-2",
          parentId: "group-1",
          x: 100,
          y: 80,
          visible: false,
        }),
        "shape-3": createShapeNode({
          id: "shape-3",
          x: 300,
          y: 200,
        }),
      },
      rootIds: ["group-1", "shape-3"],
    });

    expect(document.elements.map((element) => element.id)).toEqual(["shape-1", "shape-2", "shape-3"]);

    const firstChild = document.elements.find((element) => element.id === "shape-1");
    expect(firstChild).toMatchObject({
      worldX: 50,
      worldY: 80,
      worldOpacity: 0.4,
      effectiveLocked: true,
      effectiveVisible: false,
    });

    const secondChild = document.elements.find((element) => element.id === "shape-2");
    expect(secondChild).toMatchObject({
      effectiveLocked: true,
      effectiveVisible: false,
    });
  });
});
