import { describe, expect, it } from "vitest";
import type { CanvasRenderableNode, CanvasWorkbench } from "@/types";
import { createCanvasTestDocument, createGroupNode, createShapeNode } from "./document/testUtils";
import { planCanvasLayerDrop } from "./layerPanelState";

const resolvePanelLayers = (workbench: CanvasWorkbench): CanvasRenderableNode[] => {
  const ordered: CanvasRenderableNode[] = [];
  const visit = (nodeId: string) => {
    const node = workbench.allNodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    ordered.push(node);
    if (node.type === "group") {
      node.childIds
        .slice()
        .reverse()
        .forEach((childId) => {
          visit(childId);
        });
    }
  };

  workbench.rootIds
    .slice()
    .reverse()
    .forEach((nodeId) => {
      visit(nodeId);
    });

  return ordered;
};

describe("layerPanelState", () => {
  it("reverses panel order back into document order for same-parent reorders", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-a": createShapeNode({ id: "shape-a", x: 0, y: 0 }),
        "shape-b": createShapeNode({ id: "shape-b", x: 120, y: 0 }),
        "shape-c": createShapeNode({ id: "shape-c", x: 240, y: 0 }),
      },
      rootIds: ["shape-a", "shape-b", "shape-c"],
    });

    const plan = planCanvasLayerDrop({
      draggingId: "shape-c",
      layers: resolvePanelLayers(workbench),
      targetId: "shape-a",
      workbench,
    });

    expect(plan).toEqual({
      kind: "reorder",
      orderedIds: ["shape-c", "shape-a", "shape-b"],
      parentId: null,
    });
  });

  it("plans a reparent when dropping onto a group", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({ id: "group-1", x: 20, y: 20, childIds: [] }),
        "shape-1": createShapeNode({ id: "shape-1", x: 220, y: 40 }),
      },
      rootIds: ["group-1", "shape-1"],
    });

    const plan = planCanvasLayerDrop({
      draggingId: "shape-1",
      layers: resolvePanelLayers(workbench),
      targetId: "group-1",
      workbench,
    });

    expect(plan).toEqual({
      kind: "reparent",
      ids: ["shape-1"],
      index: 0,
      parentId: "group-1",
    });
  });

  it("rejects drops that would create a parent cycle", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 20,
          y: 20,
          childIds: ["group-2"],
        }),
        "group-2": createGroupNode({
          id: "group-2",
          parentId: "group-1",
          x: 40,
          y: 40,
          childIds: ["shape-1"],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-2",
          x: 10,
          y: 10,
        }),
      },
      rootIds: ["group-1"],
    });

    const plan = planCanvasLayerDrop({
      draggingId: "group-1",
      layers: resolvePanelLayers(workbench),
      targetId: "group-2",
      workbench,
    });

    expect(plan).toEqual({ kind: "noop" });
  });

  it("treats missing drag state as a no-op", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 0, y: 0 }),
      },
      rootIds: ["shape-1"],
    });

    expect(
      planCanvasLayerDrop({
        draggingId: null,
        layers: resolvePanelLayers(workbench),
        targetId: "shape-1",
        workbench,
      })
    ).toEqual({ kind: "noop" });
  });
});
