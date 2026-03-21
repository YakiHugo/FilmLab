import { getCurrentUserId } from "@/lib/authToken";
import type {
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
  CanvasNode,
  CanvasNodeId,
  CanvasNodeTransform,
  CanvasTextElement,
} from "@/types";
import { normalizeCanvasTextElement } from "../textStyle";
import { createCanvasNodeId, normalizeNode } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { clone, toNodeTransform, withSyncedTransformFields } from "./shared";

type LegacyCanvasShapeElement = {
  fill?: string;
  height: number;
  id: string;
  locked: boolean;
  opacity: number;
  parentId?: null;
  rotation: number;
  shape?: "rect" | "ellipse";
  stroke?: string;
  strokeWidth?: number;
  transform?: Partial<CanvasNodeTransform>;
  type: "shape";
  visible: boolean;
  width: number;
  x: number;
  y: number;
  zIndex?: number;
};

type LegacyCanvasTextElement = {
  color: string;
  content: string;
  fontFamily: string;
  fontSize: number;
  fontSizeTier?: CanvasTextElement["fontSizeTier"];
  height: number;
  id: string;
  locked: boolean;
  opacity: number;
  parentId?: null;
  rotation: number;
  textAlign: CanvasTextElement["textAlign"];
  transform?: Partial<CanvasNodeTransform>;
  type: "text";
  visible: boolean;
  width: number;
  x: number;
  y: number;
  zIndex?: number;
};

type LegacyCanvasImageElement = {
  adjustments?: Extract<CanvasNode, { type: "image" }>["adjustments"];
  assetId: string;
  filmProfileId?: string;
  height: number;
  id: string;
  locked: boolean;
  opacity: number;
  parentId?: null;
  rotation: number;
  transform?: Partial<CanvasNodeTransform>;
  type: "image";
  visible: boolean;
  width: number;
  x: number;
  y: number;
  zIndex?: number;
};

export type NormalizableCanvasWorkbench = Partial<
  Omit<CanvasWorkbenchSnapshot, "nodes" | "rootIds" | "version">
> & {
  elements?: Array<LegacyCanvasImageElement | LegacyCanvasTextElement | LegacyCanvasShapeElement>;
  nodes?: Record<string, CanvasNode>;
  rootIds?: CanvasNodeId[];
  version?: number;
};

export interface NormalizedCanvasWorkbenchResult {
  document: CanvasWorkbench;
  removedLegacyShapeIds: string[];
}

const normalizeLegacyNodeTransform = (input: {
  height?: number;
  rotation?: number;
  width?: number;
  x?: number;
  y?: number;
}) =>
  toNodeTransform({
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation,
  });

const normalizeLegacyElement = (
  element: LegacyCanvasImageElement | LegacyCanvasTextElement | LegacyCanvasShapeElement
): CanvasNode => {
  if (element.type === "text") {
    return withSyncedTransformFields(
      normalizeCanvasTextElement({
        ...element,
        parentId: null,
        transform: normalizeLegacyNodeTransform(element),
      })
    );
  }

  if (element.type === "shape") {
    return withSyncedTransformFields({
      id: element.id,
      type: "shape",
      parentId: null,
      transform: normalizeLegacyNodeTransform(element),
      opacity: element.opacity,
      locked: element.locked,
      visible: element.visible,
      shapeType: element.shape === "ellipse" ? "ellipse" : "rect",
      fill: element.fill ?? "#f4d29c",
      stroke: element.stroke ?? "#ffffff",
      strokeWidth: Math.max(0, Number(element.strokeWidth ?? 0) || 0),
    });
  }

  return withSyncedTransformFields({
    ...element,
    parentId: null,
    transform: normalizeLegacyNodeTransform(element),
  });
};

export const normalizeCanvasWorkbenchWithCleanup = (
  document: NormalizableCanvasWorkbench
): NormalizedCanvasWorkbenchResult => {
  const removedLegacyShapeIds: string[] = [];
  const normalizedNodes: Record<string, CanvasNode> = {};
  const legacyElements = Array.isArray(document.elements) ? document.elements.slice() : [];

  if (document.version === 2 && document.nodes) {
    for (const [nodeId, node] of Object.entries(document.nodes)) {
      normalizedNodes[nodeId] = normalizeNode(node);
    }
  } else {
    const orderedLegacyElements = legacyElements.sort(
      (left, right) => Number(left.zIndex ?? 0) - Number(right.zIndex ?? 0)
    );

    for (const entry of orderedLegacyElements) {
      const normalizedNode = normalizeLegacyElement(entry);
      normalizedNodes[normalizedNode.id] = normalizedNode;
      if (entry.type === "shape" && !entry.shape) {
        removedLegacyShapeIds.push(entry.id);
      }
    }
  }

  const snapshot: CanvasWorkbenchSnapshot = {
    id: document.id ?? createCanvasNodeId("canvas-document"),
    version: 2,
    ownerRef: document.ownerRef ?? { userId: getCurrentUserId() },
    name: document.name ?? "Untitled 工作台",
    width: Math.max(1, Number(document.width) || 1080),
    height: Math.max(1, Number(document.height) || 1350),
    presetId: document.presetId ?? "social-portrait",
    backgroundColor: document.backgroundColor ?? "#050505",
    nodes: normalizedNodes,
    rootIds:
      document.version === 2 && document.rootIds
        ? document.rootIds.filter((nodeId) => Boolean(normalizedNodes[nodeId]))
        : legacyElements
            .slice()
            .sort((left, right) => Number(left.zIndex ?? 0) - Number(right.zIndex ?? 0))
            .map((entry) => entry.id)
            .filter((nodeId) => Boolean(normalizedNodes[nodeId])),
    slices: clone(document.slices ?? []),
    guides: {
      showCenter: Boolean(document.guides?.showCenter),
      showThirds: document.guides?.showThirds ?? true,
      showSafeArea: document.guides?.showSafeArea ?? true,
    },
    safeArea: {
      top: Math.max(0, Number(document.safeArea?.top) || 0),
      right: Math.max(0, Number(document.safeArea?.right) || 0),
      bottom: Math.max(0, Number(document.safeArea?.bottom) || 0),
      left: Math.max(0, Number(document.safeArea?.left) || 0),
    },
    createdAt: document.createdAt ?? new Date().toISOString(),
    updatedAt: document.updatedAt ?? new Date().toISOString(),
    thumbnailBlob: document.thumbnailBlob,
  };

  return {
    document: resolveCanvasWorkbench(snapshot),
    removedLegacyShapeIds,
  };
};

export const normalizeCanvasWorkbench = (document: NormalizableCanvasWorkbench): CanvasWorkbench =>
  normalizeCanvasWorkbenchWithCleanup(document).document;
