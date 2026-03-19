import type {
  CanvasCommand,
  CanvasDocument,
  CanvasDocumentPatch,
  CanvasDocumentPatchOperation,
  CanvasDocumentSnapshot,
  CanvasElement,
  CanvasGroupNode,
  CanvasNode,
  CanvasNodeId,
  CanvasNodePropertyPatch,
  CanvasNodeTransform,
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasShapeElement,
  CanvasShapePoint,
  CanvasTextElement,
} from "@/types";
import { normalizeCanvasTextElement } from "./textStyle";

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
  adjustments?: Extract<CanvasElement, { type: "image" }>["adjustments"];
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

export type NormalizableCanvasDocument = Partial<
  Omit<CanvasDocumentSnapshot, "nodes" | "rootIds" | "version">
> & {
  elements?: Array<LegacyCanvasImageElement | LegacyCanvasTextElement | LegacyCanvasShapeElement>;
  nodes?: Record<string, CanvasNode>;
  rootIds?: CanvasNodeId[];
  version?: number;
};

export interface NormalizedCanvasDocumentResult {
  document: CanvasDocument;
  removedLegacyShapeIds: string[];
}

interface AccumulatedTransform {
  opacity: number;
  rotation: number;
  x: number;
  y: number;
}

const DEFAULT_TRANSFORM: CanvasNodeTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
};

const DOCUMENT_FIELD_KEYS = [
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

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const areEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const rotatePoint = (point: { x: number; y: number }, rotationDeg: number) => {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

const toNodeTransform = (input?: Partial<CanvasNodeTransform>): CanvasNodeTransform => ({
  x: Number(input?.x ?? DEFAULT_TRANSFORM.x) || 0,
  y: Number(input?.y ?? DEFAULT_TRANSFORM.y) || 0,
  width: Math.max(1, Number(input?.width ?? DEFAULT_TRANSFORM.width) || 1),
  height: Math.max(1, Number(input?.height ?? DEFAULT_TRANSFORM.height) || 1),
  rotation: Number(input?.rotation ?? DEFAULT_TRANSFORM.rotation) || 0,
});

const withSyncedTransformFields = <T extends { transform: CanvasNodeTransform }>(
  node: T
): T & Pick<CanvasNodeTransform, "x" | "y" | "width" | "height" | "rotation"> => ({
  ...node,
  x: node.transform.x,
  y: node.transform.y,
  width: node.transform.width,
  height: node.transform.height,
  rotation: node.transform.rotation,
});

const isGroupNode = (node: CanvasNode): node is CanvasGroupNode => node.type === "group";

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

const localPointToWorldPoint = (
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

const getBoundsFromPoints = (points: Array<{ x: number; y: number }>) => {
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

const computeLeafBounds = (
  transform: AccumulatedTransform,
  node: CanvasElement
): CanvasRenderableNode["bounds"] => {
  const corners = getNodeCorners(node.transform).map((point) =>
    localPointToWorldPoint(transform, point)
  );
  return getBoundsFromPoints(corners);
};

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

const normalizeNode = (node: CanvasNode): CanvasNode => {
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

const sanitizeRootOrder = (
  nodes: Record<string, CanvasNode>,
  rootIds: CanvasNodeId[] | undefined
): CanvasNodeId[] => {
  const existingRootIds = Object.values(nodes)
    .filter((node) => !node.parentId)
    .map((node) => node.id);
  const orderedIds = Array.from(new Set(rootIds ?? []))
    .filter((nodeId) => nodes[nodeId] && !nodes[nodeId]!.parentId);

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
    ...node,
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

export const createCanvasDocumentPatch = (
  before: CanvasDocumentSnapshot,
  after: CanvasDocumentSnapshot
): CanvasDocumentPatch => {
  const operations: CanvasDocumentPatchOperation[] = [];
  const fields: Record<string, unknown> = {};

  for (const key of DOCUMENT_FIELD_KEYS) {
    if (!areEqual(before[key], after[key])) {
      fields[key] = clone(after[key]);
    }
  }

  if (Object.keys(fields).length > 0) {
    operations.push({
      type: "patchDocument",
      fields: fields as Extract<CanvasDocumentPatchOperation, { type: "patchDocument" }>["fields"],
    });
  }

  if (!areEqual(before.rootIds, after.rootIds)) {
    operations.push({
      type: "setRootIds",
      rootIds: after.rootIds.slice(),
    });
  }

  const nodeIds = new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);
  for (const nodeId of nodeIds) {
    const beforeNode = before.nodes[nodeId];
    const afterNode = after.nodes[nodeId];
    if (!afterNode) {
      operations.push({
        type: "deleteNode",
        nodeId,
      });
      continue;
    }
    if (!beforeNode || !areEqual(beforeNode, afterNode)) {
      operations.push({
        type: "putNode",
        node: clone(afterNode),
      });
    }
  }

  return { operations };
};

export const applyCanvasDocumentPatch = (
  document: CanvasDocument | CanvasDocumentSnapshot,
  patch: CanvasDocumentPatch
): CanvasDocument => {
  const nextSnapshot = getCanvasDocumentSnapshot(document);
  for (const operation of patch.operations) {
    if (operation.type === "patchDocument") {
      Object.assign(nextSnapshot, clone(operation.fields));
      continue;
    }
    if (operation.type === "setRootIds") {
      nextSnapshot.rootIds = operation.rootIds.slice();
      continue;
    }
    if (operation.type === "putNode") {
      nextSnapshot.nodes[operation.node.id] = clone(operation.node);
      continue;
    }
    delete nextSnapshot.nodes[operation.nodeId];
  }
  return resolveCanvasDocument(nextSnapshot);
};

export const normalizeCanvasDocumentWithCleanup = (
  document: NormalizableCanvasDocument
): NormalizedCanvasDocumentResult => {
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

  const snapshot: CanvasDocumentSnapshot = {
    id: document.id ?? createCanvasNodeId("canvas-document"),
    version: 2,
    name: document.name ?? "Untitled board",
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
    document: resolveCanvasDocument(snapshot),
    removedLegacyShapeIds,
  };
};

export const normalizeCanvasDocument = (document: NormalizableCanvasDocument): CanvasDocument =>
  normalizeCanvasDocumentWithCleanup(document).document;

const moveIdsInOrder = (ids: CanvasNodeId[], movingIds: CanvasNodeId[], index: number) => {
  const remaining = ids.filter((entry) => !movingIds.includes(entry));
  const insertIndex = Math.max(0, Math.min(index, remaining.length));
  const next = remaining.slice();
  next.splice(insertIndex, 0, ...movingIds);
  return next;
};

const collectWorldTransformById = (document: CanvasDocument, ids: CanvasNodeId[]) =>
  new Map(
    ids
      .map((nodeId) => [nodeId, getCanvasNodeWorldTransform(document, nodeId)] as const)
      .filter((entry): entry is readonly [CanvasNodeId, AccumulatedTransform] => Boolean(entry[1]))
  );

const setChildOrder = (
  snapshot: CanvasDocumentSnapshot,
  parentId: CanvasNodeId | null,
  orderedIds: CanvasNodeId[]
) => {
  if (!parentId) {
    snapshot.rootIds = orderedIds.slice();
    return;
  }
  const parent = snapshot.nodes[parentId];
  if (parent?.type === "group") {
    parent.childIds = orderedIds.slice();
  }
};

const getChildOrder = (snapshot: CanvasDocumentSnapshot, parentId: CanvasNodeId | null) => {
  if (!parentId) {
    return snapshot.rootIds.slice();
  }
  const parent = snapshot.nodes[parentId];
  return parent?.type === "group" ? parent.childIds.slice() : [];
};

const deleteNodeRecursive = (snapshot: CanvasDocumentSnapshot, nodeId: CanvasNodeId) => {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    return;
  }

  if (node.type === "group") {
    for (const childId of node.childIds.slice()) {
      deleteNodeRecursive(snapshot, childId);
    }
  }

  if (node.parentId) {
    const parent = snapshot.nodes[node.parentId];
    if (parent?.type === "group") {
      parent.childIds = parent.childIds.filter((childId) => childId !== nodeId);
    }
  } else {
    snapshot.rootIds = snapshot.rootIds.filter((rootId) => rootId !== nodeId);
  }

  delete snapshot.nodes[nodeId];
};

const applyNodePropertyPatch = (node: CanvasNode, patch: CanvasNodePropertyPatch): CanvasNode => {
  const nextTransform: CanvasNodeTransform = {
    x: patch.x ?? node.transform.x,
    y: patch.y ?? node.transform.y,
    width: patch.width ?? node.transform.width,
    height: patch.height ?? node.transform.height,
    rotation: patch.rotation ?? node.transform.rotation,
  };

  if (node.type === "group") {
    return withSyncedTransformFields({
      ...node,
      transform: toNodeTransform(nextTransform),
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      name: patch.name ?? node.name,
    });
  }

  if (node.type === "image") {
    return withSyncedTransformFields({
      ...node,
      transform: toNodeTransform(nextTransform),
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      filmProfileId: patch.filmProfileId ?? node.filmProfileId,
      adjustments: patch.adjustments ?? node.adjustments,
    });
  }

  if (node.type === "text") {
    return withSyncedTransformFields(
      normalizeCanvasTextElement({
      ...node,
      transform: toNodeTransform(nextTransform),
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      color: patch.color ?? node.color,
      content: patch.content ?? node.content,
      fontFamily: patch.fontFamily ?? node.fontFamily,
      fontSize: patch.fontSize ?? node.fontSize,
      fontSizeTier: patch.fontSizeTier ?? node.fontSizeTier,
      textAlign: patch.textAlign ?? node.textAlign,
      })
    );
  }

  return withSyncedTransformFields({
    ...node,
    transform: toNodeTransform(nextTransform),
    locked: patch.locked ?? node.locked,
    opacity: patch.opacity ?? node.opacity,
    visible: patch.visible ?? node.visible,
    arrowHead: patch.arrowHead ?? node.arrowHead,
    fill: patch.fill ?? node.fill,
    points: patch.points ?? node.points,
    radius: patch.radius ?? node.radius,
    shapeType: patch.shapeType ?? node.shapeType,
    stroke: patch.stroke ?? node.stroke,
    strokeWidth: patch.strokeWidth ?? node.strokeWidth,
  });
};

export const executeCanvasCommand = (
  document: CanvasDocument,
  command: CanvasCommand
): {
  document: CanvasDocument;
  forwardPatch: CanvasDocumentPatch;
  inversePatch: CanvasDocumentPatch;
} => {
  const before = getCanvasDocumentSnapshot(document);
  const next = clone(before);

  if (command.type === "PATCH_DOCUMENT") {
    Object.assign(next, clone(command.patch), { updatedAt: new Date().toISOString() });
  } else if (command.type === "INSERT_NODES") {
    const nodes = command.nodes.map((node) => normalizeNode(node));
    const targetParentId = command.parentId ?? nodes[0]?.parentId ?? null;
    for (const node of nodes) {
      next.nodes[node.id] = withSyncedTransformFields({
        ...node,
        parentId: targetParentId,
      });
    }
    const currentOrder = getChildOrder(next, targetParentId);
    const insertIds = nodes.map((node) => node.id);
    setChildOrder(
      next,
      targetParentId,
      moveIdsInOrder(currentOrder, insertIds, command.index ?? currentOrder.length)
    );
  } else if (command.type === "UPDATE_NODE_PROPS") {
    for (const update of command.updates) {
      const currentNode = next.nodes[update.id];
      if (currentNode) {
        next.nodes[update.id] = applyNodePropertyPatch(currentNode, update.patch);
      }
    }
  } else if (command.type === "MOVE_NODES") {
    const runtime = resolveCanvasDocument(next);
    for (const nodeId of command.ids) {
      const currentNode = next.nodes[nodeId];
      if (!currentNode) {
        continue;
      }
      const parentTransform = currentNode.parentId
        ? getCanvasNodeWorldTransform(runtime, currentNode.parentId)
        : null;
      const localDelta = parentTransform
        ? rotatePoint({ x: command.dx, y: command.dy }, -parentTransform.rotation)
        : { x: command.dx, y: command.dy };
      next.nodes[nodeId] = withSyncedTransformFields({
        ...currentNode,
        transform: toNodeTransform({
          ...currentNode.transform,
          x: currentNode.transform.x + localDelta.x,
          y: currentNode.transform.y + localDelta.y,
        }),
      });
    }
  } else if (command.type === "DELETE_NODES") {
    for (const nodeId of command.ids) {
      deleteNodeRecursive(next, nodeId);
    }
  } else if (command.type === "GROUP_NODES") {
    const uniqueIds = Array.from(new Set(command.ids)).filter((nodeId) => next.nodes[nodeId]);
    if (uniqueIds.length > 0) {
      const runtime = resolveCanvasDocument(next);
      const worldTransforms = collectWorldTransformById(runtime, uniqueIds);
      const renderables = uniqueIds
        .map((nodeId) => getCanvasRenderableNode(runtime, nodeId))
        .filter((node): node is CanvasRenderableNode => Boolean(node));

      if (renderables.length > 0) {
        const points = renderables.flatMap((node) => [
          { x: node.bounds.x, y: node.bounds.y },
          { x: node.bounds.x + node.bounds.width, y: node.bounds.y },
          { x: node.bounds.x + node.bounds.width, y: node.bounds.y + node.bounds.height },
          { x: node.bounds.x, y: node.bounds.y + node.bounds.height },
        ]);
        const bounds = getBoundsFromPoints(points);
        const groupId = command.groupId ?? createCanvasNodeId("canvas-group");
        next.nodes[groupId] = withSyncedTransformFields({
          id: groupId,
          type: "group",
          parentId: null,
          transform: toNodeTransform({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            rotation: 0,
          }),
          opacity: 1,
          locked: false,
          visible: true,
          childIds: uniqueIds.slice(),
          name: command.name ?? "Group",
        });

        for (const nodeId of uniqueIds) {
          const currentNode = next.nodes[nodeId];
          const worldTransform = worldTransforms.get(nodeId);
          if (!currentNode || !worldTransform) {
            continue;
          }
          next.nodes[nodeId] = withSyncedTransformFields({
            ...currentNode,
            parentId: groupId,
            transform: toNodeTransform({
              ...currentNode.transform,
              x: worldTransform.x - bounds.x,
              y: worldTransform.y - bounds.y,
              rotation: worldTransform.rotation,
            }),
          });
        }

        next.rootIds = next.rootIds.filter((nodeId) => !uniqueIds.includes(nodeId));
        next.rootIds.push(groupId);
      }
    }
  } else if (command.type === "UNGROUP_NODE") {
    const runtime = resolveCanvasDocument(next);
    const group = next.nodes[command.id];
    if (group?.type === "group") {
      const targetParentId = group.parentId;
      const targetParentTransform =
        targetParentId ? getCanvasNodeWorldTransform(runtime, targetParentId) : null;
      const targetOrder = getChildOrder(next, targetParentId);
      const insertIndex = targetOrder.indexOf(group.id);
      const childIds = group.childIds.slice();

      for (const childId of childIds) {
        const child = next.nodes[childId];
        const childWorld = getCanvasNodeWorldTransform(runtime, childId);
        if (!child || !childWorld) {
          continue;
        }
        const local = targetParentId
          ? worldPointToLocalPoint(runtime, targetParentId, {
              x: childWorld.x,
              y: childWorld.y,
            })
          : { x: childWorld.x, y: childWorld.y };
        next.nodes[childId] = withSyncedTransformFields({
          ...child,
          parentId: targetParentId,
          transform: toNodeTransform({
            ...child.transform,
            x: local.x,
            y: local.y,
            rotation: childWorld.rotation - (targetParentTransform?.rotation ?? 0),
          }),
        });
      }

      delete next.nodes[group.id];
      if (targetParentId) {
        const parent = next.nodes[targetParentId];
        if (parent?.type === "group") {
          parent.childIds = parent.childIds.filter((childId) => childId !== group.id);
          parent.childIds.splice(
            insertIndex >= 0 ? insertIndex : parent.childIds.length,
            0,
            ...childIds
          );
        }
      } else {
        const remainingRoots = next.rootIds.filter((nodeId) => nodeId !== group.id);
        remainingRoots.splice(insertIndex >= 0 ? insertIndex : remainingRoots.length, 0, ...childIds);
        next.rootIds = remainingRoots;
      }
    }
  } else if (command.type === "REPARENT_NODES") {
    const uniqueIds = Array.from(new Set(command.ids)).filter((nodeId) => next.nodes[nodeId]);
    if (uniqueIds.length > 0) {
      const runtime = resolveCanvasDocument(next);
      const worldTransforms = collectWorldTransformById(runtime, uniqueIds);
      for (const nodeId of uniqueIds) {
        const currentNode = next.nodes[nodeId];
        if (!currentNode) {
          continue;
        }
        if (currentNode.parentId) {
          const parent = next.nodes[currentNode.parentId];
          if (parent?.type === "group") {
            parent.childIds = parent.childIds.filter((childId) => childId !== nodeId);
          }
        } else {
          next.rootIds = next.rootIds.filter((rootId) => rootId !== nodeId);
        }
      }

      const currentOrder = getChildOrder(next, command.parentId);
      setChildOrder(
        next,
        command.parentId,
        moveIdsInOrder(currentOrder, uniqueIds, command.index ?? currentOrder.length)
      );

      const parentWorldTransform =
        command.parentId ? getCanvasNodeWorldTransform(runtime, command.parentId) : null;
      for (const nodeId of uniqueIds) {
        const currentNode = next.nodes[nodeId];
        const world = worldTransforms.get(nodeId);
        if (!currentNode || !world) {
          continue;
        }
        const local = worldPointToLocalPoint(runtime, command.parentId, {
          x: world.x,
          y: world.y,
        });
        next.nodes[nodeId] = withSyncedTransformFields({
          ...currentNode,
          parentId: command.parentId,
          transform: toNodeTransform({
            ...currentNode.transform,
            x: local.x,
            y: local.y,
            rotation: world.rotation - (parentWorldTransform?.rotation ?? 0),
          }),
        });
      }
    }
  } else if (command.type === "REORDER_CHILDREN") {
    setChildOrder(
      next,
      command.parentId,
      command.orderedIds.filter((nodeId) => Boolean(next.nodes[nodeId]))
    );
  } else if (command.type === "TOGGLE_NODE_LOCK") {
    const node = next.nodes[command.id];
    if (node) {
      node.locked = !node.locked;
    }
  } else if (command.type === "TOGGLE_NODE_VISIBILITY") {
    const node = next.nodes[command.id];
    if (node) {
      node.visible = !node.visible;
    }
  } else if (command.type === "APPLY_IMAGE_ADJUSTMENTS") {
    const node = next.nodes[command.id];
    if (node?.type === "image") {
      node.adjustments = command.adjustments;
    }
  }

  next.updatedAt = new Date().toISOString();
  const nextDocument = resolveCanvasDocument(next);
  return {
    document: nextDocument,
    forwardPatch: createCanvasDocumentPatch(before, getCanvasDocumentSnapshot(nextDocument)),
    inversePatch: createCanvasDocumentPatch(getCanvasDocumentSnapshot(nextDocument), before),
  };
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
