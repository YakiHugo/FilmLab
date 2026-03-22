import { describe, expect, it } from "vitest";
import { worldPointToLocalPoint } from "./documentGraph";
import { createCanvasTestDocument, createGroupNode, createShapeNode } from "./document/testUtils";
import { planCanvasNodePropertyCommand } from "./propertyPanelState";

describe("propertyPanelState", () => {
  it("clamps width updates to a positive value", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 0, y: 0 }),
      },
      rootIds: ["shape-1"],
    });
    const node = workbench.allNodes.find((entry) => entry.id === "shape-1");
    if (!node) {
      throw new Error("Expected shape node.");
    }

    const command = planCanvasNodePropertyCommand({
      intent: { type: "set-width", value: 0 },
      node,
      workbench,
    });

    expect(command).toEqual({
      type: "UPDATE_NODE_PROPS",
      updates: [{ id: "shape-1", patch: { width: 1 } }],
    });
  });

  it("clamps opacity updates into the supported range", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 0, y: 0 }),
      },
      rootIds: ["shape-1"],
    });
    const node = workbench.allNodes.find((entry) => entry.id === "shape-1");
    if (!node) {
      throw new Error("Expected shape node.");
    }

    const command = planCanvasNodePropertyCommand({
      intent: { type: "set-opacity", value: 2 },
      node,
      workbench,
    });

    expect(command).toEqual({
      type: "UPDATE_NODE_PROPS",
      updates: [{ id: "shape-1", patch: { opacity: 1 } }],
    });
  });

  it("converts world-space x updates into local coordinates for grouped nodes", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 100,
          y: 50,
          rotation: 90,
          childIds: ["shape-1"],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 0,
          y: 0,
        }),
      },
      rootIds: ["group-1"],
    });
    const node = workbench.allNodes.find((entry) => entry.id === "shape-1");
    if (!node) {
      throw new Error("Expected grouped shape node.");
    }

    const command = planCanvasNodePropertyCommand({
      intent: { type: "set-x", value: 140 },
      node,
      workbench,
    });
    const expectedLocalPosition = worldPointToLocalPoint(workbench, "group-1", {
      x: 140,
      y: node.y,
    });

    expect(command).toEqual({
      type: "UPDATE_NODE_PROPS",
      updates: [{ id: "shape-1", patch: { x: expectedLocalPosition.x } }],
    });
  });

  it("only emits text-specific patches for text nodes", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "text-1": {
          id: "text-1",
          type: "text",
          parentId: null,
          x: 10,
          y: 20,
          width: 200,
          height: 80,
          rotation: 0,
          transform: {
            x: 10,
            y: 20,
            width: 200,
            height: 80,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
          content: "Hello",
          fontFamily: "Georgia",
          fontSize: 24,
          fontSizeTier: "small",
          color: "#ffffff",
          textAlign: "left",
        },
      },
      rootIds: ["text-1"],
    });
    const node = workbench.allNodes.find((entry) => entry.id === "text-1");
    if (!node || node.type !== "text") {
      throw new Error("Expected text node.");
    }

    const command = planCanvasNodePropertyCommand({
      intent: { type: "set-text-font-size-tier", value: "xl" },
      node,
      workbench,
    });

    expect(command).toEqual({
      type: "UPDATE_NODE_PROPS",
      updates: [
        {
          id: "text-1",
          patch: {
            fontSize: 64,
            fontSizeTier: "xl",
          },
        },
      ],
    });
  });

  it("rejects element-specific intents for incompatible node types", () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({ id: "group-1", x: 0, y: 0, childIds: [] }),
      },
      rootIds: ["group-1"],
    });
    const node = workbench.allNodes.find((entry) => entry.id === "group-1");
    if (!node) {
      throw new Error("Expected group node.");
    }

    expect(
      planCanvasNodePropertyCommand({
        intent: { type: "set-image-film-profile", value: "profile-1" },
        node,
        workbench,
      })
    ).toBeNull();
  });
});
