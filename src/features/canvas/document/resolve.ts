import type {
  CanvasElement,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import {
  computeLeafBounds,
  getBoundsFromPoints,
  localPointToWorldPoint,
  type AccumulatedTransform,
} from "./geometry";
import { buildCanvasHierarchyIndex } from "./hierarchy";
import { clone } from "./shared";

const resolveNodeRecursive = (
  snapshot: CanvasWorkbenchSnapshot,
  nodeId: string,
  parentId: string | null,
  parentTransform: AccumulatedTransform,
  parentLocked: boolean,
  parentVisible: boolean,
  depth: number,
  allNodes: CanvasRenderableNode[],
  elements: CanvasRenderableElement[]
): CanvasRenderableNode | null => {
  const node = snapshot.nodes[nodeId];
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
    const childIds = snapshot.groupChildren[node.id] ?? [];
    const groupNode: CanvasRenderableNode = {
      ...node,
      parentId,
      childIds: childIds.slice(),
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
    for (const childId of childIds) {
      const child = resolveNodeRecursive(
        snapshot,
        childId,
        node.id,
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
    parentId,
    childIds: [],
    depth,
    bounds: computeLeafBounds(accumulated, node as CanvasElement),
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

export const resolveCanvasWorkbench = (snapshot: CanvasWorkbenchSnapshot): CanvasWorkbench => {
  buildCanvasHierarchyIndex(snapshot);

  const allNodes: CanvasRenderableNode[] = [];
  const elements: CanvasRenderableElement[] = [];

  for (const rootId of snapshot.rootIds) {
    resolveNodeRecursive(
      snapshot,
      rootId,
      null,
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
    version: 4,
    nodes: clone(snapshot.nodes),
    rootIds: snapshot.rootIds.slice(),
    groupChildren: clone(snapshot.groupChildren),
    allNodes,
    elements,
  };
};
