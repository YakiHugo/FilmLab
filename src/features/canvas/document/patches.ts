import type {
  CanvasDocumentChangeSet,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { getCanvasWorkbenchSnapshot } from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { clone } from "./shared";

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
