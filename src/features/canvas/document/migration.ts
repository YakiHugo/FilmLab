import { getCurrentUserId } from "@/lib/authToken";
import { createId } from "@/utils";
import type {
  CanvasNode,
  CanvasNodeId,
  CanvasNodeTransform,
  CanvasPersistedNode,
  CanvasTextElement,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { normalizeCanvasTextElement } from "../textStyle";
import { deriveLegacyGroupChildren, normalizeCanvasHierarchy } from "./hierarchy";
import { normalizeNode } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { clone, toNodeTransform } from "./shared";

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
  renderState?: Extract<CanvasNode, { type: "image" }>["renderState"];
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

type LegacyCanvasNodeMap = Record<string, CanvasNode>;

export type NormalizableCanvasWorkbench = Partial<
  Omit<CanvasWorkbenchSnapshot, "groupChildren" | "nodes" | "rootIds" | "version">
> & {
  elements?: Array<LegacyCanvasImageElement | LegacyCanvasTextElement | LegacyCanvasShapeElement>;
  groupChildren?: Record<string, CanvasNodeId[]>;
  nodes?: Record<string, CanvasPersistedNode | CanvasNode>;
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
    const transform = normalizeLegacyNodeTransform(element);
    return normalizeCanvasTextElement({
      ...element,
      parentId: null,
      transform,
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
    });
  }

  if (element.type === "shape") {
    const transform = normalizeLegacyNodeTransform(element);
    return {
      id: element.id,
      type: "shape",
      parentId: null,
      transform,
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
      opacity: element.opacity,
      locked: element.locked,
      visible: element.visible,
      zIndex: element.zIndex,
      shapeType: element.shape === "ellipse" ? "ellipse" : "rect",
      fill: element.fill ?? "#f4d29c",
      stroke: element.stroke ?? "#ffffff",
      strokeWidth: Math.max(0, Number(element.strokeWidth ?? 0) || 0),
    };
  }

  const transform = normalizeLegacyNodeTransform(element);
  return {
    id: element.id,
    type: "image",
    parentId: null,
    transform,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    opacity: element.opacity,
    locked: element.locked,
    visible: element.visible,
    zIndex: element.zIndex,
    assetId: element.assetId,
    renderState: element.renderState,
    adjustments: element.adjustments,
    filmProfileId: element.filmProfileId,
  };
};

const isLegacyNodeMap = (
  version: number | undefined,
  nodes: Record<string, CanvasPersistedNode | CanvasNode> | undefined
): nodes is LegacyCanvasNodeMap =>
  Boolean(nodes && version !== 4);

export const normalizeCanvasWorkbenchWithCleanup = (
  document: NormalizableCanvasWorkbench
): NormalizedCanvasWorkbenchResult => {
  const removedLegacyShapeIds: string[] = [];
  const normalizedNodes: Record<string, CanvasPersistedNode> = {};
  const legacyElements = Array.isArray(document.elements) ? document.elements.slice() : [];
  const parentHints: Record<string, CanvasNodeId | null | undefined> = {};
  let explicitRootIds = document.rootIds?.slice();
  let explicitGroupChildren = document.groupChildren ? clone(document.groupChildren) : undefined;

  if (document.version === 4 && document.nodes) {
    for (const [nodeId, node] of Object.entries(document.nodes)) {
      normalizedNodes[nodeId] = normalizeNode(node);
    }
  } else if (isLegacyNodeMap(document.version, document.nodes)) {
    for (const [nodeId, node] of Object.entries(document.nodes)) {
      normalizedNodes[nodeId] = normalizeNode(node);
      parentHints[nodeId] = node.parentId ?? null;
    }
    explicitGroupChildren = deriveLegacyGroupChildren(document.nodes);
  } else {
    const orderedLegacyElements = legacyElements.sort(
      (left, right) => Number(left.zIndex ?? 0) - Number(right.zIndex ?? 0)
    );

    for (const entry of orderedLegacyElements) {
      const normalizedNode = normalizeLegacyElement(entry);
      normalizedNodes[normalizedNode.id] = normalizeNode(normalizedNode);
      parentHints[normalizedNode.id] = normalizedNode.parentId ?? null;
      if (entry.type === "shape" && !entry.shape) {
        removedLegacyShapeIds.push(entry.id);
      }
    }

    explicitRootIds = orderedLegacyElements.map((entry) => entry.id);
  }

  const normalizedHierarchy = normalizeCanvasHierarchy({
    nodes: normalizedNodes,
    rootIds: explicitRootIds,
    groupChildren: explicitGroupChildren,
    parentHints,
  });

  const snapshot: CanvasWorkbenchSnapshot = {
    id: document.id ?? createId("workbench-id"),
    version: 4,
    ownerRef: document.ownerRef ?? { userId: getCurrentUserId() },
    name: document.name ?? "Untitled Workbench",
    width: Math.max(1, Number(document.width) || 1080),
    height: Math.max(1, Number(document.height) || 1350),
    presetId: document.presetId ?? "social-portrait",
    backgroundColor: document.backgroundColor ?? "#050505",
    nodes: normalizedNodes,
    rootIds: normalizedHierarchy.rootIds,
    groupChildren: normalizedHierarchy.groupChildren,
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
    preferredCoverAssetId:
      typeof document.preferredCoverAssetId === "string"
        ? document.preferredCoverAssetId
        : null,
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
