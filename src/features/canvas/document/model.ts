import type {
  CanvasDocument,
  CanvasDocumentSnapshot,
  CanvasNode,
  CanvasNodeId,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasShapeElement,
  CanvasShapePoint,
} from "@/types";
import { normalizeCanvasTextElement } from "../textStyle";
import { clone, toNodeTransform, withSyncedTransformFields } from "./shared";

export const isCanvasRenderableElement = (
  node: CanvasRenderableNode
): node is CanvasRenderableElement => node.type !== "group";

export const isCanvasTextRenderable = (
  node: CanvasRenderableNode | null | undefined
): node is Extract<CanvasRenderableNode, { type: "text" }> => node?.type === "text";

export const isCanvasImageRenderable = (
  node: CanvasRenderableNode | null | undefined
): node is Extract<CanvasRenderableNode, { type: "image" }> => node?.type === "image";

export const isCanvasShapeRenderable = (
  node: CanvasRenderableNode | null | undefined
): node is Extract<CanvasRenderableNode, { type: "shape" }> => node?.type === "shape";

export const createCanvasNodeId = (prefix = "canvas-node") => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

export const getCanvasNode = (
  document: Pick<CanvasDocumentSnapshot, "nodes">,
  nodeId: CanvasNodeId
) => document.nodes[nodeId] ?? null;

export const getCanvasDocumentSnapshot = (
  document: CanvasDocument | CanvasDocumentSnapshot
): CanvasDocumentSnapshot => ({
  id: document.id,
  version: 2,
  name: document.name,
  width: document.width,
  height: document.height,
  presetId: document.presetId,
  backgroundColor: document.backgroundColor,
  nodes: clone(document.nodes),
  rootIds: document.rootIds.slice(),
  slices: clone(document.slices),
  guides: clone(document.guides),
  safeArea: clone(document.safeArea),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  thumbnailBlob: document.thumbnailBlob,
});

export const normalizeNode = (node: CanvasNode): CanvasNode => {
  if (node.type === "text") {
    return withSyncedTransformFields(
      normalizeCanvasTextElement({
        ...node,
        transform: toNodeTransform(node.transform),
        parentId: node.parentId ?? null,
      })
    );
  }

  if (node.type === "shape") {
    return withSyncedTransformFields({
      ...node,
      parentId: node.parentId ?? null,
      transform: toNodeTransform(node.transform),
      strokeWidth: Math.max(0, Number(node.strokeWidth) || 0),
      radius: typeof node.radius === "number" ? Math.max(0, node.radius) : undefined,
      points: node.points?.map((point) => ({
        x: Number(point.x) || 0,
        y: Number(point.y) || 0,
      })),
      arrowHead: node.arrowHead
        ? {
            start: Boolean(node.arrowHead.start),
            end: Boolean(node.arrowHead.end),
          }
        : undefined,
    });
  }

  if (node.type === "group") {
    return withSyncedTransformFields({
      ...node,
      parentId: node.parentId ?? null,
      transform: toNodeTransform(node.transform),
      childIds: Array.from(new Set(node.childIds ?? [])),
      name: node.name || "Group",
    });
  }

  return withSyncedTransformFields({
    ...node,
    parentId: node.parentId ?? null,
    transform: toNodeTransform(node.transform),
  });
};

export const getCanvasRenderableNode = (
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasRenderableNode | null => document.allNodes.find((node) => node.id === nodeId) ?? null;

export const getCanvasRenderableElement = (
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasRenderableElement | null => document.elements.find((node) => node.id === nodeId) ?? null;

export const getCanvasDescendantIds = (
  document: Pick<CanvasDocumentSnapshot, "nodes">,
  nodeId: CanvasNodeId
): CanvasNodeId[] => {
  const node = document.nodes[nodeId];
  if (!node || node.type !== "group") {
    return [];
  }

  const descendants: CanvasNodeId[] = [];
  for (const childId of node.childIds) {
    descendants.push(childId, ...getCanvasDescendantIds(document, childId));
  }
  return descendants;
};

export const createDefaultShapeNode = ({
  fill = "rgba(244,210,156,0.2)",
  height = 160,
  id = createCanvasNodeId("canvas-shape"),
  parentId = null,
  shapeType = "rect",
  stroke = "#f4d29c",
  strokeWidth = 2,
  width = 240,
  x,
  y,
}: {
  fill?: string;
  height?: number;
  id?: string;
  parentId?: CanvasNodeId | null;
  shapeType?: CanvasShapeElement["shapeType"];
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  x: number;
  y: number;
}): CanvasShapeElement => ({
  ...withSyncedTransformFields({
    id,
    type: "shape",
    parentId,
    transform: toNodeTransform({
      x,
      y,
      width,
      height,
      rotation: 0,
    }),
    opacity: 1,
    locked: false,
    visible: true,
    shapeType,
    fill,
    stroke,
    strokeWidth,
    ...(shapeType === "line" || shapeType === "arrow"
      ? {
          points: [
            { x: 0, y: height / 2 },
            { x: width, y: height / 2 },
          ] satisfies CanvasShapePoint[],
          arrowHead: shapeType === "arrow" ? { start: false, end: true } : undefined,
        }
      : {}),
  }),
});

export const getCanvasLayerCount = (document: CanvasDocument | null) => document?.allNodes.length ?? 0;
