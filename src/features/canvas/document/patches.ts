import type {
  CanvasDocumentDelta,
  CanvasDocumentDeltaOp,
  CanvasDocumentMetaPatch,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { getCanvasWorkbenchSnapshot } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { areEqual, clone } from "./shared";

const PATCHABLE_DOCUMENT_META_KEYS = [
  "backgroundColor",
  "guides",
  "height",
  "name",
  "presetId",
  "preferredCoverAssetId",
  "safeArea",
  "slices",
  "thumbnailBlob",
  "width",
] as const satisfies ReadonlyArray<keyof CanvasDocumentMetaPatch>;

export const diffCanvasDocumentDelta = (
  beforeDocument: CanvasWorkbench | CanvasWorkbenchSnapshot,
  afterDocument: CanvasWorkbench | CanvasWorkbenchSnapshot
) => {
  const before = getCanvasWorkbenchSnapshot(beforeDocument);
  const after = getCanvasWorkbenchSnapshot(afterDocument);
  const operations: CanvasDocumentDeltaOp[] = [];

  const beforePatch = {} as CanvasDocumentMetaPatch;
  const afterPatch = {} as CanvasDocumentMetaPatch;
  for (const key of PATCHABLE_DOCUMENT_META_KEYS) {
    if (areEqual(before[key], after[key])) {
      continue;
    }

    (beforePatch as Record<string, unknown>)[key] = clone(before[key]);
    (afterPatch as Record<string, unknown>)[key] = clone(after[key]);
  }

  if (Object.keys(afterPatch).length > 0) {
    operations.push({
      type: "patchDocumentMeta",
      before: beforePatch,
      after: afterPatch,
    });
  }

  const nodeIds = Array.from(
    new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])
  ).sort();
  for (const nodeId of nodeIds) {
    const previousNode = before.nodes[nodeId] ?? null;
    const nextNode = after.nodes[nodeId] ?? null;

    if (areEqual(previousNode, nextNode)) {
      continue;
    }

    operations.push({
      type: "setNode",
      nodeId,
      before: previousNode ? clone(previousNode) : null,
      after: nextNode ? clone(nextNode) : null,
    });
  }

  const groupIds = Array.from(
    new Set([
      ...Object.keys(before.groupChildren),
      ...Object.keys(after.groupChildren),
      ...Object.keys(before.nodes).filter((nodeId) => before.nodes[nodeId]?.type === "group"),
      ...Object.keys(after.nodes).filter((nodeId) => after.nodes[nodeId]?.type === "group"),
    ])
  ).sort();
  for (const groupId of groupIds) {
    const previousChildIds = before.groupChildren[groupId] ?? [];
    const nextChildIds = after.groupChildren[groupId] ?? [];
    if (areEqual(previousChildIds, nextChildIds)) {
      continue;
    }

    operations.push({
      type: "setGroupChildren",
      groupId,
      before: previousChildIds.slice(),
      after: nextChildIds.slice(),
    });
  }

  if (!areEqual(before.rootIds, after.rootIds)) {
    operations.push({
      type: "setRootOrder",
      before: before.rootIds.slice(),
      after: after.rootIds.slice(),
    });
  }

  if (!areEqual(before.updatedAt, after.updatedAt) && operations.length > 0) {
    operations.unshift({
      type: "patchDocumentMeta",
      before: { updatedAt: clone(before.updatedAt) },
      after: { updatedAt: clone(after.updatedAt) },
    });
  }

  return {
    didChange: operations.length > 0,
    delta: { operations },
  };
};

export const applyCanvasDocumentDelta = (
  document: CanvasWorkbench | CanvasWorkbenchSnapshot,
  delta: CanvasDocumentDelta,
  direction: "undo" | "redo"
): CanvasWorkbench => {
  const nextSnapshot = getCanvasWorkbenchSnapshot(document);
  const operations =
    direction === "redo"
      ? delta.operations
      : [...delta.operations].reverse();

  for (const operation of operations) {
    if (operation.type === "patchDocumentMeta") {
      Object.assign(nextSnapshot, clone(direction === "undo" ? operation.before : operation.after));
      continue;
    }

    if (operation.type === "setRootOrder") {
      nextSnapshot.rootIds = (direction === "undo" ? operation.before : operation.after).slice();
      continue;
    }

    if (operation.type === "setGroupChildren") {
      const childIds = direction === "undo" ? operation.before : operation.after;
      if (childIds.length > 0) {
        nextSnapshot.groupChildren[operation.groupId] = childIds.slice();
      } else {
        delete nextSnapshot.groupChildren[operation.groupId];
      }
      continue;
    }

    const node = direction === "undo" ? operation.before : operation.after;
    if (node) {
      nextSnapshot.nodes[operation.nodeId] = clone(node);
    } else {
      delete nextSnapshot.nodes[operation.nodeId];
    }
  }

  return resolveCanvasWorkbench(nextSnapshot);
};
