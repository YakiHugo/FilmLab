import type {
  CanvasDocumentMetaPatch,
  CanvasDocumentChangeSet,
  CanvasDocumentOp,
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
  "safeArea",
  "slices",
  "thumbnailBlob",
  "width",
] as const satisfies ReadonlyArray<keyof CanvasDocumentMetaPatch>;

export const diffCanvasDocumentChangeSet = (
  beforeDocument: CanvasWorkbench | CanvasWorkbenchSnapshot,
  afterDocument: CanvasWorkbench | CanvasWorkbenchSnapshot
) => {
  const before = getCanvasWorkbenchSnapshot(beforeDocument);
  const after = getCanvasWorkbenchSnapshot(afterDocument);
  const forward: CanvasDocumentOp[] = [];
  const inverse: CanvasDocumentOp[] = [];
  const recordOperation = (nextForward: CanvasDocumentOp, nextInverse: CanvasDocumentOp) => {
    forward.push(nextForward);
    inverse.unshift(nextInverse);
  };

  const changedPatch = {} as CanvasDocumentMetaPatch;
  const inversePatch = {} as CanvasDocumentMetaPatch;
  for (const key of PATCHABLE_DOCUMENT_META_KEYS) {
    if (areEqual(before[key], after[key])) {
      continue;
    }

    (changedPatch as Record<string, unknown>)[key] = clone(after[key]);
    (inversePatch as Record<string, unknown>)[key] = clone(before[key]);
  }

  if (Object.keys(changedPatch).length > 0) {
    recordOperation(
      { type: "patchDocumentMeta", patch: changedPatch },
      { type: "patchDocumentMeta", patch: inversePatch }
    );
  }

  const nodeIds = Array.from(
    new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])
  ).sort();
  for (const nodeId of nodeIds) {
    const previousNode = before.nodes[nodeId];
    const nextNode = after.nodes[nodeId];

    if (!previousNode && nextNode) {
      recordOperation(
        { type: "putNode", node: clone(nextNode) },
        { type: "deleteNode", nodeId }
      );
      continue;
    }

    if (previousNode && !nextNode) {
      recordOperation(
        { type: "deleteNode", nodeId },
        { type: "putNode", node: clone(previousNode) }
      );
      continue;
    }

    if (previousNode && nextNode && !areEqual(previousNode, nextNode)) {
      recordOperation(
        { type: "putNode", node: clone(nextNode) },
        { type: "putNode", node: clone(previousNode) }
      );
    }
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

    recordOperation(
      {
        type: "setGroupChildren",
        groupId,
        childIds: nextChildIds.slice(),
      },
      {
        type: "setGroupChildren",
        groupId,
        childIds: previousChildIds.slice(),
      }
    );
  }

  if (!areEqual(before.rootIds, after.rootIds)) {
    recordOperation(
      {
        type: "setRootOrder",
        rootIds: after.rootIds.slice(),
      },
      {
        type: "setRootOrder",
        rootIds: before.rootIds.slice(),
      }
    );
  }

  return {
    didChange: forward.length > 0,
    forwardChangeSet: { operations: forward },
    inverseChangeSet: { operations: inverse },
  };
};

export const applyCanvasDocumentChangeSet = (
  document: CanvasWorkbench | CanvasWorkbenchSnapshot,
  changeSet: CanvasDocumentChangeSet
): CanvasWorkbench => {
  const nextSnapshot = getCanvasWorkbenchSnapshot(document);
  for (const operation of changeSet.operations) {
    if (operation.type === "patchDocumentMeta") {
      Object.assign(nextSnapshot, clone(operation.patch));
      continue;
    }
    if (operation.type === "setRootOrder") {
      nextSnapshot.rootIds = operation.rootIds.slice();
      continue;
    }
    if (operation.type === "setGroupChildren") {
      if (operation.childIds.length > 0) {
        nextSnapshot.groupChildren[operation.groupId] = operation.childIds.slice();
      } else {
        delete nextSnapshot.groupChildren[operation.groupId];
      }
      continue;
    }
    if (operation.type === "putNode") {
      nextSnapshot.nodes[operation.node.id] = clone(operation.node);
      continue;
    }
    delete nextSnapshot.nodes[operation.nodeId];
  }
  return resolveCanvasWorkbench(nextSnapshot);
};
