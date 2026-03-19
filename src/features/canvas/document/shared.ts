import type { CanvasGroupNode, CanvasNode, CanvasNodeTransform } from "@/types";

export const DEFAULT_TRANSFORM: CanvasNodeTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
};

export const DOCUMENT_FIELD_KEYS = [
  "backgroundColor",
  "guides",
  "height",
  "name",
  "presetId",
  "safeArea",
  "slices",
  "thumbnailBlob",
  "updatedAt",
  "width",
] as const;

export const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const areEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const toNodeTransform = (input?: Partial<CanvasNodeTransform>): CanvasNodeTransform => ({
  x: Number(input?.x ?? DEFAULT_TRANSFORM.x) || 0,
  y: Number(input?.y ?? DEFAULT_TRANSFORM.y) || 0,
  width: Math.max(1, Number(input?.width ?? DEFAULT_TRANSFORM.width) || 1),
  height: Math.max(1, Number(input?.height ?? DEFAULT_TRANSFORM.height) || 1),
  rotation: Number(input?.rotation ?? DEFAULT_TRANSFORM.rotation) || 0,
});

export const withSyncedTransformFields = <T extends { transform: CanvasNodeTransform }>(
  node: T
): T & Pick<CanvasNodeTransform, "x" | "y" | "width" | "height" | "rotation"> => ({
  ...node,
  x: node.transform.x,
  y: node.transform.y,
  width: node.transform.width,
  height: node.transform.height,
  rotation: node.transform.rotation,
});

export const isGroupNode = (node: CanvasNode): node is CanvasGroupNode => node.type === "group";
