import type {
  CanvasWorkbench,
  CanvasNodeId,
  CanvasNodeTransform,
  CanvasPersistedElement,
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
  document: CanvasWorkbench,
  nodeId: CanvasNodeId
): AccumulatedTransform | null => {
  const node = document.allNodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return null;
  }
  return {
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    opacity: node.worldOpacity,
  };
};

export const worldPointToLocalPoint = (
  document: CanvasWorkbench,
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
  node: CanvasPersistedElement
): CanvasRenderableNode["bounds"] => {
  const corners = getNodeCorners(node.transform).map((point) =>
    localPointToWorldPoint(transform, point)
  );
  return getBoundsFromPoints(corners);
};

export const collectWorldTransformById = (document: CanvasWorkbench, ids: CanvasNodeId[]) =>
  new Map(
    ids
      .map((nodeId) => [nodeId, getCanvasNodeWorldTransform(document, nodeId)] as const)
      .filter((entry): entry is readonly [CanvasNodeId, AccumulatedTransform] => Boolean(entry[1]))
  );
