import { describe, expect, it } from "vitest";
import { createCanvasTestDocument, createGroupNode, createShapeNode } from "./document/testUtils";
import { resolveCanvasLayerOrderPlan } from "./canvasLayerOrderActions";

describe("canvasLayerOrderActions", () => {
  it("moves a multi-selection to the front while preserving relative order", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        a: createShapeNode({ id: "a", x: 0, y: 0 }),
        b: createShapeNode({ id: "b", x: 100, y: 0 }),
        c: createShapeNode({ id: "c", x: 200, y: 0 }),
        d: createShapeNode({ id: "d", x: 300, y: 0 }),
      },
      rootIds: ["a", "b", "c", "d"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "bring-to-front",
        selectedElementIds: ["b", "c"],
        workbench,
      })
    ).toEqual({
      orderedIds: ["a", "d", "b", "c"],
      parentId: null,
    });
  });

  it("steps a multi-selection backward by one slot while preserving internal order", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        a: createShapeNode({ id: "a", x: 0, y: 0 }),
        b: createShapeNode({ id: "b", x: 100, y: 0 }),
        c: createShapeNode({ id: "c", x: 200, y: 0 }),
        d: createShapeNode({ id: "d", x: 300, y: 0 }),
      },
      rootIds: ["a", "b", "c", "d"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "send-backward",
        selectedElementIds: ["c", "d"],
        workbench,
      })
    ).toEqual({
      orderedIds: ["a", "c", "d", "b"],
      parentId: null,
    });
  });

  it("disables ordering when the selection spans different parents", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          childIds: ["shape-1"],
          id: "group-1",
          x: 0,
          y: 0,
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 40,
          y: 40,
        }),
        "shape-2": createShapeNode({ id: "shape-2", x: 200, y: 0 }),
      },
      rootIds: ["group-1", "shape-2"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "bring-forward",
        selectedElementIds: ["shape-1", "shape-2"],
        workbench,
      })
    ).toBeNull();
  });

  it("disables ordering when ancestor and descendant are both selected", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          childIds: ["shape-1"],
          id: "group-1",
          x: 0,
          y: 0,
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 40,
          y: 40,
        }),
      },
      rootIds: ["group-1"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "bring-to-front",
        selectedElementIds: ["group-1", "shape-1"],
        workbench,
      })
    ).toBeNull();
  });

  it("returns null when the selection is already at the front boundary", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        a: createShapeNode({ id: "a", x: 0, y: 0 }),
        b: createShapeNode({ id: "b", x: 100, y: 0 }),
        c: createShapeNode({ id: "c", x: 200, y: 0 }),
      },
      rootIds: ["a", "b", "c"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "bring-to-front",
        selectedElementIds: ["c"],
        workbench,
      })
    ).toBeNull();
  });

  it("returns null when the selection is already at the back boundary", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        a: createShapeNode({ id: "a", x: 0, y: 0 }),
        b: createShapeNode({ id: "b", x: 100, y: 0 }),
        c: createShapeNode({ id: "c", x: 200, y: 0 }),
      },
      rootIds: ["a", "b", "c"],
    });

    expect(
      resolveCanvasLayerOrderPlan({
        action: "send-to-back",
        selectedElementIds: ["a"],
        workbench,
      })
    ).toBeNull();
  });
});
