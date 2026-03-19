import type {
  CanvasDocument,
  CanvasElement,
  CanvasNode,
  CanvasNodeId,
  CanvasNodeTransform,
  CanvasRenderableNode,
} from "@/types";

export interface AccumulatedTransform {
  opacity: number;
  rotation: number;
  x: number;
  y: number;
}

export const rotatePoint = (point: { x: number; y: number }, rotationDeg: number) => {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

export const getCanvasNodeWorldTransform = (
  document: CanvasDocument,
  nodeId: CanvasNodeId
): AccumulatedTransform | null => {
  const node = document.nodes[nodeId];
  if (!node) {
    return null;
  }

  const lineage: CanvasNode[] = [];
  let current: CanvasNode | undefined = node;
  while (current) {
    lineage.unshift(current);
    current = current.parentId ? document.nodes[current.parentId] : undefined;
  }

  let accumulated: AccumulatedTransform = {
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
  };

  for (const entry of lineage) {
    const rotated = rotatePoint(
      {
        x: entry.transform.x,
        y: entry.transform.y,
      },
      accumulated.rotation
    );
    accumulated = {
      x: accumulated.x + rotated.x,
      y: accumulated.y + rotated.y,
      rotation: accumulated.rotation + entry.transform.rotation,
      opacity: accumulated.opacity * entry.opacity,
    };
  }

  return accumulated;
};

export const worldPointToLocalPoint = (
  document: CanvasDocument,
  parentId: CanvasNodeId | null,
  worldPoint: { x: number; y: number }
) => {
  if (!parentId) {
    return worldPoint;
  }

  const parentTransform = getCanvasNodeWorldTransform(document, parentId);
  if (!parentTransform) {
    return worldPoint;
  }

  const translated = {
    x: worldPoint.x - parentTransform.x,
    y: worldPoint.y - parentTransform.y,
  };

  return rotatePoint(translated, -parentTransform.rotation);
};

export const localPointToWorldPoint = (
  parentTransform: AccumulatedTransform,
  point: { x: number; y: number }
) => {
  const rotated = rotatePoint(point, parentTransform.rotation);
  return {
    x: parentTransform.x + rotated.x,
    y: parentTransform.y + rotated.y,
  };
};

const getNodeCorners = (transform: CanvasNodeTransform) => [
  { x: 0, y: 0 },
  { x: transform.width, y: 0 },
  { x: transform.width, y: transform.height },
  { x: 0, y: transform.height },
];

export const getBoundsFromPoints = (points: Array<{ x: number; y: number }>) => {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export const computeLeafBounds = (
  transform: AccumulatedTransform,
  node: CanvasElement
): CanvasRenderableNode["bounds"] => {
  const corners = getNodeCorners(node.transform).map((point) =>
    localPointToWorldPoint(transform, point)
  );
  return getBoundsFromPoints(corners);
};

export const collectWorldTransformById = (document: CanvasDocument, ids: CanvasNodeId[]) =>
  new Map(
    ids
      .map((nodeId) => [nodeId, getCanvasNodeWorldTransform(document, nodeId)] as const)
      .filter((entry): entry is readonly [CanvasNodeId, AccumulatedTransform] => Boolean(entry[1]))
  );
