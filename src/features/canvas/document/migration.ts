import { getCurrentUserId } from "@/lib/authToken";
import { createId } from "@/utils";
import type {
  CanvasNode,
  CanvasNodeId,
  CanvasPersistedNode,
  CanvasPersistedElement,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { normalizeCanvasHierarchy } from "./hierarchy";
import { normalizeNode } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { clone } from "./shared";

export type NormalizableCanvasWorkbench = Partial<
  Omit<CanvasWorkbenchSnapshot, "groupChildren" | "nodes" | "rootIds" | "version">
> & {
  elements?: Array<CanvasPersistedElement | CanvasNode>;
  groupChildren?: Record<string, CanvasNodeId[]>;
  nodes?: Record<string, CanvasPersistedNode | CanvasNode>;
  rootIds?: CanvasNodeId[];
  version?: number;
};

export interface NormalizedCanvasWorkbenchResult {
  document: CanvasWorkbench;
  removedLegacyShapeIds: string[];
}

const CURRENT_CANVAS_WORKBENCH_VERSION = 5;

const assertCurrentCanvasWorkbenchVersion = (version: number | undefined) => {
  if (version === undefined || version === CURRENT_CANVAS_WORKBENCH_VERSION) {
    return;
  }
  throw new Error(
    `Unsupported canvas snapshot version ${version}. Expected version ${CURRENT_CANVAS_WORKBENCH_VERSION}.`
  );
};

const normalizeCanvasWorkbenchInternal = (
  document: NormalizableCanvasWorkbench
): NormalizedCanvasWorkbenchResult => {
  const normalizedNodes: Record<string, CanvasPersistedNode> = {};
  const parentHints: Record<string, CanvasNodeId | null | undefined> = {};

  if (document.nodes) {
    for (const [nodeId, node] of Object.entries(document.nodes)) {
      normalizedNodes[nodeId] = normalizeNode(node);
      if ("parentId" in node) {
        parentHints[nodeId] = node.parentId ?? null;
      }
    }
  } else if (Array.isArray(document.elements)) {
    for (const node of document.elements) {
      normalizedNodes[node.id] = normalizeNode(node);
      if ("parentId" in node) {
        parentHints[node.id] = node.parentId ?? null;
      }
    }
  }

  const normalizedHierarchy = normalizeCanvasHierarchy({
    nodes: normalizedNodes,
    rootIds: document.rootIds?.slice(),
    groupChildren: document.groupChildren ? clone(document.groupChildren) : undefined,
    parentHints,
  });

  const snapshot: CanvasWorkbenchSnapshot = {
    id: document.id ?? createId("workbench-id"),
    version: CURRENT_CANVAS_WORKBENCH_VERSION,
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
    removedLegacyShapeIds: [],
  };
};

export const normalizeCanvasWorkbenchWithCleanup = (
  document: NormalizableCanvasWorkbench
): NormalizedCanvasWorkbenchResult => {
  assertCurrentCanvasWorkbenchVersion(document.version);
  return normalizeCanvasWorkbenchInternal(document);
};

export const normalizeCanvasWorkbench = (document: NormalizableCanvasWorkbench): CanvasWorkbench =>
  normalizeCanvasWorkbenchInternal(document).document;
