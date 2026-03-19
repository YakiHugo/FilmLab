import type {
  CanvasDocument,
  CanvasDocumentSnapshot,
  CanvasElement,
  CanvasNode,
  CanvasNodeId,
  CanvasRenderableElement,
  CanvasRenderableNode,
} from "@/types";
import {
  computeLeafBounds,
  getBoundsFromPoints,
  localPointToWorldPoint,
  type AccumulatedTransform,
} from "./geometry";
import { normalizeNode } from "./model";
import { clone, isGroupNode } from "./shared";

const sanitizeRootOrder = (
  nodes: Record<string, CanvasNode>,
  rootIds: CanvasNodeId[] | undefined
): CanvasNodeId[] => {
  const existingRootIds = Object.values(nodes)
    .filter((node) => !node.parentId)
    .map((node) => node.id);
  const orderedIds = Array.from(new Set(rootIds ?? [])).filter(
    (nodeId) => nodes[nodeId] && !nodes[nodeId]!.parentId
  );

  for (const nodeId of existingRootIds) {
    if (!orderedIds.includes(nodeId)) {
      orderedIds.push(nodeId);
    }
  }

  return orderedIds;
};

const sanitizeNodeHierarchy = (
  nodes: Record<string, CanvasNode>,
  rootIds: CanvasNodeId[]
): { nodes: Record<string, CanvasNode>; rootIds: CanvasNodeId[] } => {
  const nextNodes = clone(nodes);
  const sanitizedRootIds = sanitizeRootOrder(nextNodes, rootIds);

  for (const node of Object.values(nextNodes)) {
    if (!isGroupNode(node)) {
      continue;
    }

    node.childIds = node.childIds.filter((childId) => {
      const child = nextNodes[childId];
      if (!child) {
        return false;
      }
      child.parentId = node.id;
      return true;
    });
  }

  for (const node of Object.values(nextNodes)) {
    if (node.parentId && !nextNodes[node.parentId]) {
      node.parentId = null;
    }
  }

  for (const node of Object.values(nextNodes)) {
    if (!node.parentId) {
      continue;
    }
    const parent = nextNodes[node.parentId];
    if (parent?.type === "group" && !parent.childIds.includes(node.id)) {
      parent.childIds.push(node.id);
    }
  }

  return {
    nodes: nextNodes,
    rootIds: sanitizeRootOrder(nextNodes, sanitizedRootIds),
  };
};

const resolveNodeRecursive = (
  nodes: Record<string, CanvasNode>,
  nodeId: CanvasNodeId,
  parentTransform: AccumulatedTransform,
  parentLocked: boolean,
  parentVisible: boolean,
  depth: number,
  allNodes: CanvasRenderableNode[],
  elements: CanvasRenderableElement[]
): CanvasRenderableNode | null => {
  const node = nodes[nodeId];
  if (!node) {
    return null;
  }

  const worldOrigin = localPointToWorldPoint(parentTransform, {
    x: node.transform.x,
    y: node.transform.y,
  });
  const accumulated: AccumulatedTransform = {
    x: worldOrigin.x,
    y: worldOrigin.y,
    rotation: parentTransform.rotation + node.transform.rotation,
    opacity: parentTransform.opacity * node.opacity,
  };
  const effectiveLocked = parentLocked || node.locked;
  const effectiveVisible = parentVisible && node.visible;

  if (node.type === "group") {
    const groupNode: CanvasRenderableNode = {
      ...node,
      childIds: node.childIds.slice(),
      depth,
      bounds: {
        x: accumulated.x,
        y: accumulated.y,
        width: node.transform.width,
        height: node.transform.height,
      },
      opacity: node.opacity,
      worldOpacity: accumulated.opacity,
      locked: node.locked,
      visible: node.visible,
      effectiveLocked,
      effectiveVisible,
      x: accumulated.x,
      y: accumulated.y,
      width: node.transform.width,
      height: node.transform.height,
      rotation: accumulated.rotation,
      transform: clone(node.transform),
    };

    const childBounds: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const childId of node.childIds) {
      const child = resolveNodeRecursive(
        nodes,
        childId,
        accumulated,
        effectiveLocked,
        effectiveVisible,
        depth + 1,
        allNodes,
        elements
      );
      if (child) {
        childBounds.push(child.bounds);
      }
    }

    if (childBounds.length > 0) {
      const points = childBounds.flatMap((bounds) => [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
      ]);
      groupNode.bounds = getBoundsFromPoints(points);
    }

    allNodes.push(groupNode);
    return groupNode;
  }

  const resolvedNode: CanvasRenderableElement = {
    ...(node as CanvasElement),
    childIds: [],
    depth,
    bounds: computeLeafBounds(accumulated, node),
    opacity: node.opacity,
    worldOpacity: accumulated.opacity,
    locked: node.locked,
    visible: node.visible,
    effectiveLocked,
    effectiveVisible,
    x: accumulated.x,
    y: accumulated.y,
    width: node.transform.width,
    height: node.transform.height,
    rotation: accumulated.rotation,
    transform: clone(node.transform),
  };

  elements.push(resolvedNode);
  allNodes.push(resolvedNode);
  return resolvedNode;
};

export const resolveCanvasDocument = (snapshot: CanvasDocumentSnapshot): CanvasDocument => {
  const sanitized = sanitizeNodeHierarchy(
    Object.fromEntries(
      Object.entries(snapshot.nodes).map(([nodeId, node]) => [nodeId, normalizeNode(node)])
    ),
    snapshot.rootIds
  );
  const allNodes: CanvasRenderableNode[] = [];
  const elements: CanvasRenderableElement[] = [];

  for (const rootId of sanitized.rootIds) {
    resolveNodeRecursive(
      sanitized.nodes,
      rootId,
      { x: 0, y: 0, rotation: 0, opacity: 1 },
      false,
      true,
      0,
      allNodes,
      elements
    );
  }

  return {
    ...snapshot,
    version: 2,
    nodes: sanitized.nodes,
    rootIds: sanitized.rootIds,
    allNodes,
    elements,
  };
};
