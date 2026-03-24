import { getCurrentUserId } from "@/lib/authToken";
import { createId } from "@/utils";
import type {
  CanvasNode,
  CanvasNodeId,
  CanvasPersistedNode,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasShapeElement,
  CanvasShapePoint,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { normalizeCanvasTextElement } from "../textStyle";
import { clone, toNodeTransform } from "./shared";

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

export const getCanvasNode = (
  document: Pick<CanvasWorkbenchSnapshot, "nodes">,
  nodeId: CanvasNodeId
) => document.nodes[nodeId] ?? null;

export const getCanvasWorkbenchSnapshot = (
  document: CanvasWorkbench | CanvasWorkbenchSnapshot
): CanvasWorkbenchSnapshot => ({
  id: document.id,
  version: 3,
  ownerRef: document.ownerRef ?? { userId: getCurrentUserId() },
  name: document.name,
  width: document.width,
  height: document.height,
  presetId: document.presetId,
  backgroundColor: document.backgroundColor,
  nodes: clone(document.nodes),
  rootIds: document.rootIds.slice(),
  groupChildren: clone(document.groupChildren),
  slices: clone(document.slices),
  guides: clone(document.guides),
  safeArea: clone(document.safeArea),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  thumbnailBlob: document.thumbnailBlob,
});

export const normalizeNode = (node: CanvasPersistedNode | CanvasNode): CanvasPersistedNode => {
  if (node.type === "text") {
    const transform = toNodeTransform(node.transform);
    const normalized = normalizeCanvasTextElement({
      ...node,
      parentId: null,
      transform,
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
    });
    return {
      id: normalized.id,
      type: "text",
      transform: toNodeTransform(normalized.transform),
      zIndex: normalized.zIndex,
      opacity: normalized.opacity,
      locked: normalized.locked,
      visible: normalized.visible,
      color: normalized.color,
      content: normalized.content,
      fontFamily: normalized.fontFamily,
      fontSize: normalized.fontSize,
      fontSizeTier: normalized.fontSizeTier,
      textAlign: normalized.textAlign,
    };
  }

  if (node.type === "shape") {
    return {
      id: node.id,
      type: "shape",
      transform: toNodeTransform(node.transform),
      zIndex: node.zIndex,
      opacity: node.opacity,
      locked: node.locked,
      visible: node.visible,
      shapeType: node.shapeType,
      fill: node.fill,
      stroke: node.stroke,
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
    };
  }

  if (node.type === "group") {
    return {
      id: node.id,
      type: "group",
      transform: toNodeTransform(node.transform),
      zIndex: node.zIndex,
      opacity: node.opacity,
      locked: node.locked,
      visible: node.visible,
      name: node.name || "Group",
    };
  }

  return {
    id: node.id,
    type: "image",
    transform: toNodeTransform(node.transform),
    zIndex: node.zIndex,
    opacity: node.opacity,
    locked: node.locked,
    visible: node.visible,
    assetId: node.assetId,
    adjustments: node.adjustments,
    filmProfileId: node.filmProfileId,
  };
};

export const getCanvasRenderableNode = (
  document: CanvasWorkbench,
  nodeId: CanvasNodeId
): CanvasRenderableNode | null => document.allNodes.find((node) => node.id === nodeId) ?? null;

export const getCanvasRenderableElement = (
  document: CanvasWorkbench,
  nodeId: CanvasNodeId
): CanvasRenderableElement | null => document.elements.find((node) => node.id === nodeId) ?? null;

export const getCanvasDescendantIds = (
  document: Pick<CanvasWorkbenchSnapshot, "groupChildren" | "nodes">,
  nodeId: CanvasNodeId
): CanvasNodeId[] => {
  const node = document.nodes[nodeId];
  if (!node || node.type !== "group") {
    return [];
  }

  const descendants: CanvasNodeId[] = [];
  for (const childId of document.groupChildren[nodeId] ?? []) {
    descendants.push(childId, ...getCanvasDescendantIds(document, childId));
  }
  return descendants;
};

export const createDefaultShapeNode = ({
  fill = "rgba(244,210,156,0.2)",
  height = 160,
  id = createId("node-id"),
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
  x,
  y,
  width,
  height,
  rotation: 0,
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
});

export const getCanvasLayerCount = (document: CanvasWorkbench | null) => document?.allNodes.length ?? 0;
