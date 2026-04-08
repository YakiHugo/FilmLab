import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import { getCanvasNodeWorldTransform, worldPointToLocalPoint } from "./geometry";
import { getCanvasWorkbenchSnapshot } from "./model";
import { executeCanvasCommand } from "./commands";
import { applyCanvasDocumentDelta } from "./patches";
import { createCanvasTestDocument, createGroupNode, createImageNode, createShapeNode } from "./testUtils";

describe("document commands", () => {
  it("groups same-parent siblings in sibling order and preserves world transforms", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-a": createShapeNode({ id: "shape-a", x: 10, y: 20 }),
        "shape-b": createShapeNode({ id: "shape-b", x: 180, y: 40 }),
        "shape-c": createShapeNode({ id: "shape-c", x: 360, y: 80 }),
      },
      rootIds: ["shape-a", "shape-b", "shape-c"],
    });
    const beforeWorldA = getCanvasNodeWorldTransform(document, "shape-a");
    const beforeWorldB = getCanvasNodeWorldTransform(document, "shape-b");

    const result = executeCanvasCommand(document, {
      type: "GROUP_NODES",
      ids: ["shape-b", "shape-a"],
      groupId: "group-1",
    });

    expect(result.didChange).toBe(true);
    expect(result.document.rootIds).toEqual(["group-1", "shape-c"]);
    expect(result.document.nodes["group-1"]).toMatchObject({
      id: "group-1",
      type: "group",
    });
    expect(result.document.groupChildren["group-1"]).toEqual(["shape-a", "shape-b"]);
    expect(getCanvasNodeWorldTransform(result.document, "shape-a")).toEqual(beforeWorldA);
    expect(getCanvasNodeWorldTransform(result.document, "shape-b")).toEqual(beforeWorldB);
  });

  it("rejects cross-parent grouping as a no-op", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 40,
          y: 60,
          childIds: ["shape-1"],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 20,
          y: 30,
        }),
        "shape-2": createShapeNode({
          id: "shape-2",
          x: 240,
          y: 180,
        }),
      },
      rootIds: ["group-1", "shape-2"],
    });

    const result = executeCanvasCommand(document, {
      type: "GROUP_NODES",
      ids: ["shape-1", "shape-2"],
      groupId: "group-2",
    });

    expect(result.didChange).toBe(false);
    expect(result.document).toBe(document);
  });

  it("rejects grouping when the requested group id already exists", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 10, y: 20 }),
        "shape-2": createShapeNode({ id: "shape-2", x: 180, y: 40 }),
        "group-1": createGroupNode({ id: "group-1", x: 320, y: 80, childIds: [] }),
      },
      rootIds: ["shape-1", "shape-2", "group-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "GROUP_NODES",
      ids: ["shape-1", "shape-2"],
      groupId: "group-1",
    });

    expect(result.didChange).toBe(false);
    expect(getCanvasWorkbenchSnapshot(result.document)).toEqual(getCanvasWorkbenchSnapshot(document));
    expect(result.delta.operations).toEqual([]);
  });

  it("ungroups by preserving world transforms and materializing inherited flags", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 120,
          y: 80,
          opacity: 0.5,
          locked: true,
          visible: false,
          childIds: ["shape-1"],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 30,
          y: 40,
          opacity: 0.8,
        }),
      },
      rootIds: ["group-1"],
    });
    const beforeWorld = getCanvasNodeWorldTransform(document, "shape-1");

    const result = executeCanvasCommand(document, {
      type: "UNGROUP_NODE",
      id: "group-1",
    });

    expect(result.didChange).toBe(true);
    expect(result.document.rootIds).toEqual(["shape-1"]);
    expect(result.document.nodes["shape-1"]).toMatchObject({
      visible: false,
      locked: true,
      opacity: 0.4,
    });
    expect(result.document.allNodes.find((node) => node.id === "shape-1")).toMatchObject({
      parentId: null,
    });
    expect(getCanvasNodeWorldTransform(result.document, "shape-1")).toEqual(beforeWorld);
    expect(result.document.elements[0]).toMatchObject({
      effectiveVisible: false,
      effectiveLocked: true,
      worldOpacity: 0.4,
    });
  });

  it("reparents under a rotated parent without changing world coordinates", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "group-1": createGroupNode({
          id: "group-1",
          x: 100,
          y: 50,
          rotation: 90,
          childIds: [],
        }),
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 140,
          y: 60,
          rotation: 15,
        }),
      },
      rootIds: ["group-1", "shape-1"],
    });
    const beforeWorld = getCanvasNodeWorldTransform(document, "shape-1");

    const result = executeCanvasCommand(document, {
      type: "REPARENT_NODES",
      ids: ["shape-1"],
      parentId: "group-1",
    });

    expect(result.didChange).toBe(true);
    expect(getCanvasNodeWorldTransform(result.document, "shape-1")).toEqual(beforeWorld);
  });

  it("moves nodes under rotated parents in world space", () => {
    const document = createCanvasTestDocument({
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
    const beforeWorld = getCanvasNodeWorldTransform(document, "shape-1");

    const result = executeCanvasCommand(document, {
      type: "MOVE_NODES",
      ids: ["shape-1"],
      dx: 10,
      dy: 0,
    });
    const afterWorld = getCanvasNodeWorldTransform(result.document, "shape-1");
    const localPoint = worldPointToLocalPoint(result.document, "group-1", {
      x: afterWorld?.x ?? 0,
      y: afterWorld?.y ?? 0,
    });

    expect(result.didChange).toBe(true);
    expect(afterWorld).toMatchObject({
      x: (beforeWorld?.x ?? 0) + 10,
      y: beforeWorld?.y ?? 0,
    });
    expect(localPoint).toMatchObject({
      x: result.document.nodes["shape-1"]?.transform.x,
      y: result.document.nodes["shape-1"]?.transform.y,
    });
  });

  it("treats inserts with duplicate batch ids as a no-op", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "INSERT_NODES",
      nodes: [
        createShapeNode({ id: "duplicate", x: 120, y: 100 }),
        createShapeNode({ id: "duplicate", x: 220, y: 180 }),
      ],
    });

    expect(result.didChange).toBe(false);
    expect(getCanvasWorkbenchSnapshot(result.document)).toEqual(getCanvasWorkbenchSnapshot(document));
    expect(result.delta.operations).toEqual([]);
  });

  it("treats inserts that collide with existing ids as a no-op", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "INSERT_NODES",
      nodes: [createShapeNode({ id: "shape-1", x: 120, y: 100 })],
    });

    expect(result.didChange).toBe(false);
    expect(getCanvasWorkbenchSnapshot(result.document)).toEqual(getCanvasWorkbenchSnapshot(document));
    expect(result.delta.operations).toEqual([]);
  });

  it("keeps inserted subtree parents while only rebasing inserted roots", () => {
    const document = createCanvasTestDocument({
      nodes: {
        host: createGroupNode({
          id: "host",
          x: 40,
          y: 60,
          childIds: [],
        }),
      },
      rootIds: ["host"],
    });

    const result = executeCanvasCommand(document, {
      type: "INSERT_NODES",
      parentId: "host",
      nodes: [
        createGroupNode({
          id: "group-1",
          x: 120,
          y: 140,
          childIds: ["shape-1"],
        }),
        createShapeNode({
          id: "shape-1",
          parentId: "group-1",
          x: 20,
          y: 30,
        }),
      ],
    });

    expect(result.didChange).toBe(true);
    expect(result.document.nodes["group-1"]).toMatchObject({
      id: "group-1",
    });
    expect(result.document.groupChildren.host).toEqual(["group-1"]);
    expect(result.document.groupChildren["group-1"]).toEqual(["shape-1"]);
    expect(result.document.allNodes.find((node) => node.id === "group-1")).toMatchObject({
      parentId: "host",
      childIds: ["shape-1"],
    });
    expect(result.document.allNodes.find((node) => node.id === "shape-1")).toMatchObject({
      parentId: "group-1",
    });
  });

  it("preserves unresolved legacy image nodes instead of fabricating generic render state", () => {
    const document = createCanvasTestDocument({
      nodes: {},
      rootIds: [],
    });

    const result = executeCanvasCommand(document, {
      type: "INSERT_NODES",
      nodes: [
        {
          ...createImageNode({
            id: "image-1",
            x: 40,
            y: 60,
          }),
          renderState: undefined,
        },
      ],
    });

    expect(result.didChange).toBe(true);
    expect(result.document.nodes["image-1"]).toMatchObject({
      id: "image-1",
      type: "image",
      renderState: undefined,
    });
  });

  it("marks invalid commands as unchanged and emits no patch operations", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "GROUP_NODES",
      ids: ["shape-1"],
      groupId: "group-1",
    });

    expect(result.didChange).toBe(false);
    expect(getCanvasWorkbenchSnapshot(result.document)).toEqual(getCanvasWorkbenchSnapshot(document));
    expect(result.delta.operations).toEqual([]);
  });

  it("rejects reorder commands that do not preserve the current sibling set", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({ id: "shape-1", x: 40, y: 60 }),
        "shape-2": createShapeNode({ id: "shape-2", x: 140, y: 60 }),
        "shape-3": createShapeNode({ id: "shape-3", x: 240, y: 60 }),
      },
      rootIds: ["shape-1", "shape-2", "shape-3"],
    });

    const result = executeCanvasCommand(document, {
      type: "REORDER_CHILDREN",
      parentId: null,
      orderedIds: ["shape-3", "shape-1"],
    });

    expect(result.didChange).toBe(false);
    expect(getCanvasWorkbenchSnapshot(result.document)).toEqual(getCanvasWorkbenchSnapshot(document));
    expect(result.delta.operations).toEqual([]);
  });

  it("treats no-op document patches as unchanged", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: document.name,
        width: document.width,
      },
    });

    expect(result.didChange).toBe(false);
    expect(result.document).toBe(document);
    expect(result.delta.operations).toEqual([]);
  });

  it("applies canonical image render-state commands and round-trips their patches", () => {
    const nextRenderState = createDefaultCanvasImageRenderState();
    nextRenderState.develop.tone.exposure = 24;
    nextRenderState.develop.tone.contrast = 12;
    const document = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({
          id: "image-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["image-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "SET_IMAGE_RENDER_STATE",
      renderState: nextRenderState,
      id: "image-1",
    });

    expect(result.didChange).toBe(true);
    expect(result.document.nodes["image-1"]).toMatchObject({
      renderState: nextRenderState,
    });

    const redone = applyCanvasDocumentDelta(document, result.delta, "redo");
    const undone = applyCanvasDocumentDelta(result.document, result.delta, "undo");

    expect(getCanvasWorkbenchSnapshot(redone)).toEqual(getCanvasWorkbenchSnapshot(result.document));
    expect(getCanvasWorkbenchSnapshot(undone)).toEqual(getCanvasWorkbenchSnapshot(document));
  });

  it("persists shape fillStyle through node property patches and change-set replay", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 40,
          y: 60,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "UPDATE_NODE_PROPS",
      updates: [
        {
          id: "shape-1",
          patch: {
            fill: "#ff0066",
            fillStyle: {
              kind: "linear-gradient",
              angle: 45,
              from: "#ff0066",
              to: "#1e90ff",
            },
          },
        },
      ],
    });

    expect(result.didChange).toBe(true);
    expect(result.document.nodes["shape-1"]).toMatchObject({
      fill: "#ff0066",
      fillStyle: {
        kind: "linear-gradient",
        angle: 45,
        from: "#ff0066",
        to: "#1e90ff",
      },
    });

    const redone = applyCanvasDocumentDelta(document, result.delta, "redo");
    const undone = applyCanvasDocumentDelta(result.document, result.delta, "undo");

    expect(getCanvasWorkbenchSnapshot(redone)).toEqual(getCanvasWorkbenchSnapshot(result.document));
    expect(getCanvasWorkbenchSnapshot(undone)).toEqual(getCanvasWorkbenchSnapshot(document));
  });
});
