import type {
  CanvasWorkbench,
  CanvasWorkbenchPatch,
  CanvasWorkbenchPatchOperation,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { getCanvasWorkbenchSnapshot } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { areEqual, clone, DOCUMENT_FIELD_KEYS } from "./shared";

export const createCanvasWorkbenchPatch = (
  before: CanvasWorkbenchSnapshot,
  after: CanvasWorkbenchSnapshot
): CanvasWorkbenchPatch => {
  const operations: CanvasWorkbenchPatchOperation[] = [];
  const fields: Record<string, unknown> = {};

  for (const key of DOCUMENT_FIELD_KEYS) {
    if (!areEqual(before[key], after[key])) {
      fields[key] = clone(after[key]);
    }
  }

  if (Object.keys(fields).length > 0) {
    operations.push({
      type: "patchDocument",
      fields: fields as Extract<CanvasWorkbenchPatchOperation, { type: "patchDocument" }>["fields"],
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

export const applyCanvasWorkbenchPatch = (
  document: CanvasWorkbench | CanvasWorkbenchSnapshot,
  patch: CanvasWorkbenchPatch
): CanvasWorkbench => {
  const nextSnapshot = getCanvasWorkbenchSnapshot(document);
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
  return resolveCanvasWorkbench(nextSnapshot);
};
