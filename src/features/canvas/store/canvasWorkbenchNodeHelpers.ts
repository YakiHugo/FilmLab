import { getCurrentUserId } from "@/lib/authToken";
import {
  createDefaultCanvasWorkbenchFields,
  normalizeCanvasWorkbench,
} from "@/features/canvas/studioPresets";
import { createId } from "@/utils";
import type {
  Asset,
  CanvasEditableElement,
  CanvasNode,
  CanvasNodeId,
  CanvasWorkbench,
} from "@/types";

const nowIso = () => new Date().toISOString();

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const toEditableNodeFromPersisted = (
  source: CanvasWorkbench["nodes"][string],
  parentId: CanvasNodeId | null
): CanvasNode => {
  const baseNode = {
    id: source.id,
    type: source.type,
    parentId,
    transform: clone(source.transform),
    x: source.transform.x,
    y: source.transform.y,
    width: source.transform.width,
    height: source.transform.height,
    rotation: source.transform.rotation,
    zIndex: source.zIndex,
    opacity: source.opacity,
    locked: source.locked,
    visible: source.visible,
  } satisfies Pick<
    CanvasNode,
    | "height"
    | "id"
    | "locked"
    | "opacity"
    | "parentId"
    | "rotation"
    | "transform"
    | "type"
    | "visible"
    | "width"
    | "x"
    | "y"
    | "zIndex"
  >;

  if (source.type === "group") {
    return {
      ...baseNode,
      type: "group",
      childIds: [],
      name: source.name,
    };
  }

  if (source.type === "image") {
    return {
      ...baseNode,
      type: "image",
      assetId: source.assetId,
      renderState: clone(source.renderState),
    };
  }

  if (source.type === "text") {
    return {
      ...baseNode,
      type: "text",
      color: source.color,
      content: source.content,
      fontFamily: source.fontFamily,
      fontSize: source.fontSize,
      fontSizeTier: source.fontSizeTier,
      textAlign: source.textAlign,
    };
  }

  return {
    ...baseNode,
    type: "shape",
    arrowHead: source.arrowHead,
    fill: source.fill,
    fillStyle: source.fillStyle ? clone(source.fillStyle) : undefined,
    points: source.points ? clone(source.points) : undefined,
    radius: source.radius,
    shapeType: source.shapeType,
    stroke: source.stroke,
    strokeWidth: source.strokeWidth,
  };
};

export const toEditableElementPropertyPatch = (node: CanvasEditableElement) => ({
  ...node.transform,
  ...(node.type === "text"
    ? {
        color: node.color,
        content: node.content,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        fontSizeTier: node.fontSizeTier,
        textAlign: node.textAlign,
      }
    : {}),
  ...(node.type === "image"
    ? {
        renderState: clone(node.renderState),
      }
    : {}),
  ...(node.type === "shape"
    ? {
        arrowHead: node.arrowHead,
        fill: node.fill,
        fillStyle: node.fillStyle ? clone(node.fillStyle) : undefined,
        points: node.points ? clone(node.points) : undefined,
        radius: node.radius,
        shapeType: node.shapeType,
        stroke: node.stroke,
        strokeWidth: node.strokeWidth,
      }
    : {}),
  locked: node.locked,
  opacity: node.opacity,
  visible: node.visible,
});

export const claimUniqueNodeId = (usedIds: Set<CanvasNodeId>) => {
  let nextId = createId("node-id");
  while (usedIds.has(nextId)) {
    nextId = createId("node-id");
  }
  usedIds.add(nextId);
  return nextId;
};

export const makeDefaultWorkbench = (name = "Untitled Workbench"): CanvasWorkbench => {
  const now = nowIso();
  const defaults = createDefaultCanvasWorkbenchFields();
  return normalizeCanvasWorkbench({
    id: createId("workbench-id"),
    version: 5,
    ownerRef: { userId: getCurrentUserId() },
    name,
    ...defaults,
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
    groupChildren: {},
    preferredCoverAssetId: null,
    createdAt: now,
    updatedAt: now,
  });
};

export const cloneNodeTree = (
  workbench: CanvasWorkbench,
  nodeId: CanvasNodeId,
  offset: { x: number; y: number },
  usedIds: Set<CanvasNodeId>,
  parentId: CanvasNodeId | null,
  idMap = new Map<CanvasNodeId, CanvasNodeId>(),
  assetById?: ReadonlyMap<string, Asset>
): CanvasNode[] => {
  const source = workbench.nodes[nodeId];
  if (!source) {
    return [];
  }

  const nextId = claimUniqueNodeId(usedIds);
  idMap.set(nodeId, nextId);
  const cloneNode: CanvasNode = {
    ...toEditableNodeFromPersisted(source, parentId),
    id: nextId,
    transform: {
      ...source.transform,
      x: source.transform.x + offset.x,
      y: source.transform.y + offset.y,
    },
    x: source.transform.x + offset.x,
    y: source.transform.y + offset.y,
    width: source.transform.width,
    height: source.transform.height,
    rotation: source.transform.rotation,
  };

  if (cloneNode.type === "group") {
    const sourceGroup = source.type === "group" ? source : null;
    if (!sourceGroup) {
      return [cloneNode];
    }
    const childIds = workbench.groupChildren[sourceGroup.id] ?? [];
    const children = childIds.flatMap((childId) =>
      cloneNodeTree(workbench, childId, { x: 0, y: 0 }, usedIds, cloneNode.id, idMap, assetById)
    );
    cloneNode.childIds = childIds
      .map((childId) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    for (const child of children) {
      child.parentId = cloneNode.id;
    }
    return [cloneNode, ...children];
  }

  return [cloneNode];
};
