import type {
  CanvasCommand,
  CanvasWorkbench,
  CanvasWorkbenchPatch,
  CanvasWorkbenchSnapshot,
  CanvasNode,
  CanvasNodeId,
  CanvasNodePropertyPatch,
  CanvasNodeTransform,
  CanvasRenderableNode,
} from "@/types";
import { createId } from "@/utils";
import { normalizeCanvasTextElement } from "../textStyle";
import {
  collectWorldTransformById,
  getBoundsFromPoints,
  getCanvasNodeWorldTransform,
  rotatePoint,
  worldPointToLocalPoint,
} from "./geometry";
import {
  getCanvasDescendantIds,
  getCanvasWorkbenchSnapshot,
  getCanvasRenderableNode,
  normalizeNode,
} from "./model";
import { createCanvasWorkbenchPatch } from "./patches";
import { resolveCanvasWorkbench } from "./resolve";
import { areEqual, clone, toNodeTransform, withSyncedTransformFields } from "./shared";

const EMPTY_PATCH: CanvasWorkbenchPatch = { operations: [] };

const moveIdsInOrder = (ids: CanvasNodeId[], movingIds: CanvasNodeId[], index: number) => {
  const remaining = ids.filter((entry) => !movingIds.includes(entry));
  const insertIndex = Math.max(0, Math.min(index, remaining.length));
  const next = remaining.slice();
  next.splice(insertIndex, 0, ...movingIds);
  return next;
};

const setChildOrder = (
  snapshot: CanvasWorkbenchSnapshot,
  parentId: CanvasNodeId | null,
  orderedIds: CanvasNodeId[]
) => {
  if (!parentId) {
    if (!areEqual(snapshot.rootIds, orderedIds)) {
      snapshot.rootIds = orderedIds.slice();
      return true;
    }
    return false;
  }
  const parent = snapshot.nodes[parentId];
  if (parent?.type === "group") {
    if (!areEqual(parent.childIds, orderedIds)) {
      parent.childIds = orderedIds.slice();
      return true;
    }
    return false;
  }
  return false;
};

const getChildOrder = (snapshot: CanvasWorkbenchSnapshot, parentId: CanvasNodeId | null) => {
  if (!parentId) {
    return snapshot.rootIds.slice();
  }
  const parent = snapshot.nodes[parentId];
  return parent?.type === "group" ? parent.childIds.slice() : [];
};

const isValidParentTarget = (
  snapshot: CanvasWorkbenchSnapshot,
  parentId: CanvasNodeId | null
) => !parentId || snapshot.nodes[parentId]?.type === "group";

const insertIdsAtIndex = (ids: CanvasNodeId[], insertIds: CanvasNodeId[], index: number) => {
  const insertIndex = Math.max(0, Math.min(index, ids.length));
  const next = ids.slice();
  next.splice(insertIndex, 0, ...insertIds);
  return next;
};

const filterSelectedRoots = (snapshot: Pick<CanvasWorkbenchSnapshot, "nodes">, ids: CanvasNodeId[]) =>
  ids.filter(
    (nodeId) =>
      !ids.some(
        (candidateId) =>
          candidateId !== nodeId && getCanvasDescendantIds(snapshot, candidateId).includes(nodeId)
      )
  );

const setDocumentField = <K extends keyof CanvasWorkbenchSnapshot>(
  snapshot: CanvasWorkbenchSnapshot,
  key: K,
  value: CanvasWorkbenchSnapshot[K]
) => {
  if (areEqual(snapshot[key], value)) {
    return false;
  }
  snapshot[key] = clone(value) as CanvasWorkbenchSnapshot[K];
  return true;
};

const hasDuplicateNodeIds = (ids: CanvasNodeId[]) => new Set(ids).size !== ids.length;

const deleteNodeRecursive = (snapshot: CanvasWorkbenchSnapshot, nodeId: CanvasNodeId): boolean => {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    return false;
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
  return true;
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

export interface ExecuteCanvasCommandResult {
  didChange: boolean;
  document: CanvasWorkbench;
  forwardPatch: CanvasWorkbenchPatch;
  inversePatch: CanvasWorkbenchPatch;
}

export const executeCanvasCommand = (
  document: CanvasWorkbench,
  command: CanvasCommand
): ExecuteCanvasCommandResult => {
  const before = getCanvasWorkbenchSnapshot(document);
  const next = clone(before);
  let didChange = false;

  if (command.type === "PATCH_DOCUMENT") {
    const patch = clone(command.patch);
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      didChange = setDocumentField(next, key as keyof CanvasWorkbenchSnapshot, patch[key]!) || didChange;
    }
  } else if (command.type === "INSERT_NODES") {
    const normalizedNodes = command.nodes.map((node) => normalizeNode(node));
    const insertedIds = normalizedNodes.map((node) => node.id);

    if (!hasDuplicateNodeIds(insertedIds) && insertedIds.every((nodeId) => !next.nodes[nodeId])) {
      const insertedNodeMap = new Map(normalizedNodes.map((node) => [node.id, node]));
      const nextNodes = normalizedNodes.map((node) => {
        const isBatchRoot = !node.parentId || !insertedNodeMap.has(node.parentId);
        return {
          ...node,
          parentId: isBatchRoot && command.parentId !== undefined ? command.parentId ?? null : node.parentId,
        } satisfies CanvasNode;
      });
      const nextNodeMap = new Map(nextNodes.map((node) => [node.id, node]));
      const hasInvalidParent = nextNodes.some((node) => {
        if (!node.parentId) {
          return false;
        }

        const batchParent = nextNodeMap.get(node.parentId);
        if (batchParent) {
          return batchParent.type !== "group";
        }

        return next.nodes[node.parentId]?.type !== "group";
      });

      if (!hasInvalidParent) {
        for (const node of nextNodes) {
          next.nodes[node.id] = node;
          didChange = true;
        }

        const rootIdsByParent = new Map<CanvasNodeId | null, CanvasNodeId[]>();
        for (const node of nextNodes) {
          if (node.parentId && nextNodeMap.has(node.parentId)) {
            continue;
          }
          const parentId = node.parentId ?? null;
          const group = rootIdsByParent.get(parentId);
          if (group) {
            group.push(node.id);
            continue;
          }
          rootIdsByParent.set(parentId, [node.id]);
        }

        for (const [parentId, rootIds] of rootIdsByParent) {
          const currentOrder = getChildOrder(next, parentId);
          const insertIndex =
            command.parentId !== undefined && parentId === (command.parentId ?? null)
              ? command.index ?? currentOrder.length
              : currentOrder.length;
          didChange =
            setChildOrder(next, parentId, insertIdsAtIndex(currentOrder, rootIds, insertIndex)) ||
            didChange;
        }
      }
    }
  } else if (command.type === "UPDATE_NODE_PROPS") {
    for (const update of command.updates) {
      const currentNode = next.nodes[update.id];
      if (currentNode) {
        const nextNode = applyNodePropertyPatch(currentNode, update.patch);
        if (!areEqual(currentNode, nextNode)) {
          next.nodes[update.id] = nextNode;
          didChange = true;
        }
      }
    }
  } else if (command.type === "MOVE_NODES") {
    const runtime = resolveCanvasWorkbench(next);
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
      const nextNode = withSyncedTransformFields({
        ...currentNode,
        transform: toNodeTransform({
          ...currentNode.transform,
          x: currentNode.transform.x + localDelta.x,
          y: currentNode.transform.y + localDelta.y,
        }),
      });
      if (!areEqual(currentNode, nextNode)) {
        next.nodes[nodeId] = nextNode;
        didChange = true;
      }
    }
  } else if (command.type === "DELETE_NODES") {
    for (const nodeId of command.ids) {
      didChange = deleteNodeRecursive(next, nodeId) || didChange;
    }
  } else if (command.type === "GROUP_NODES") {
    const uniqueIds = Array.from(new Set(command.ids)).filter((nodeId) => next.nodes[nodeId]);
    const selectedParentIds = Array.from(
      new Set(uniqueIds.map((nodeId) => next.nodes[nodeId]?.parentId ?? null))
    );

    if (uniqueIds.length >= 2 && selectedParentIds.length === 1) {
      const targetParentId = selectedParentIds[0] ?? null;
      const siblingOrder = getChildOrder(next, targetParentId);
      const orderedSelectedIds = siblingOrder.filter((nodeId) => uniqueIds.includes(nodeId));
      const runtime = resolveCanvasWorkbench(next);
      const worldTransforms = collectWorldTransformById(runtime, orderedSelectedIds);
      const renderables = orderedSelectedIds
        .map((nodeId) => getCanvasRenderableNode(runtime, nodeId))
        .filter((node): node is CanvasRenderableNode => Boolean(node));

      if (renderables.length === orderedSelectedIds.length && renderables.length >= 2) {
        const points = renderables.flatMap((node) => [
          { x: node.bounds.x, y: node.bounds.y },
          { x: node.bounds.x + node.bounds.width, y: node.bounds.y },
          { x: node.bounds.x + node.bounds.width, y: node.bounds.y + node.bounds.height },
          { x: node.bounds.x, y: node.bounds.y + node.bounds.height },
        ]);
        const bounds = getBoundsFromPoints(points);
        const groupId = command.groupId ?? createId("node-id");
        const groupLocalOrigin = worldPointToLocalPoint(runtime, targetParentId, {
          x: bounds.x,
          y: bounds.y,
        });
        const targetParentTransform =
          targetParentId ? getCanvasNodeWorldTransform(runtime, targetParentId) : null;
        const groupWorldRotation = targetParentTransform?.rotation ?? 0;
        didChange = true;
        next.nodes[groupId] = withSyncedTransformFields({
          id: groupId,
          type: "group",
          parentId: targetParentId,
          transform: toNodeTransform({
            x: groupLocalOrigin.x,
            y: groupLocalOrigin.y,
            width: bounds.width,
            height: bounds.height,
            rotation: 0,
          }),
          opacity: 1,
          locked: false,
          visible: true,
          childIds: orderedSelectedIds.slice(),
          name: command.name ?? "Group",
        });

        for (const nodeId of orderedSelectedIds) {
          const currentNode = next.nodes[nodeId];
          const worldTransform = worldTransforms.get(nodeId);
          if (!currentNode || !worldTransform) {
            continue;
          }
          const localPosition = rotatePoint(
            {
              x: worldTransform.x - bounds.x,
              y: worldTransform.y - bounds.y,
            },
            -groupWorldRotation
          );
          next.nodes[nodeId] = withSyncedTransformFields({
            ...currentNode,
            parentId: groupId,
            transform: toNodeTransform({
              ...currentNode.transform,
              x: localPosition.x,
              y: localPosition.y,
              rotation: worldTransform.rotation - groupWorldRotation,
            }),
          });
        }

        const remainingSiblingIds = siblingOrder.filter(
          (nodeId) => !orderedSelectedIds.includes(nodeId)
        );
        const insertIndex = siblingOrder.indexOf(orderedSelectedIds[0]!);
        didChange = setChildOrder(
          next,
          targetParentId,
          insertIdsAtIndex(
            remainingSiblingIds,
            [groupId],
            insertIndex >= 0 ? insertIndex : remainingSiblingIds.length
          )
        ) || didChange;
      }
    }
  } else if (command.type === "UNGROUP_NODE") {
    const runtime = resolveCanvasWorkbench(next);
    const group = next.nodes[command.id];
    if (group?.type === "group") {
      didChange = true;
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
          locked: child.locked || group.locked,
          opacity: child.opacity * group.opacity,
          visible: child.visible && group.visible,
        });
      }

      delete next.nodes[group.id];
      const remainingSiblingIds = targetOrder.filter((nodeId) => nodeId !== group.id);
      didChange = setChildOrder(
        next,
        targetParentId,
        insertIdsAtIndex(
          remainingSiblingIds,
          childIds,
          insertIndex >= 0 ? insertIndex : remainingSiblingIds.length
        )
      ) || didChange;
    }
  } else if (command.type === "REPARENT_NODES") {
    const uniqueIds = filterSelectedRoots(
      next,
      Array.from(new Set(command.ids)).filter((nodeId) => next.nodes[nodeId])
    );
    const targetParentId = command.parentId;
    const createsCycle =
      targetParentId !== null &&
      uniqueIds.some(
        (nodeId) =>
          nodeId === targetParentId ||
          getCanvasDescendantIds(next, nodeId).includes(targetParentId)
      );

    if (
      uniqueIds.length > 0 &&
      isValidParentTarget(next, targetParentId) &&
      !createsCycle
    ) {
      const runtime = resolveCanvasWorkbench(next);
      const worldTransforms = collectWorldTransformById(runtime, uniqueIds);
      const currentOrder = getChildOrder(next, targetParentId);
      const nextOrder = moveIdsInOrder(
        currentOrder,
        uniqueIds,
        command.index ?? currentOrder.length
      );
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

      didChange = didChange || !areEqual(currentOrder, nextOrder);
      didChange = setChildOrder(next, targetParentId, nextOrder) || didChange;

      const parentWorldTransform =
        targetParentId ? getCanvasNodeWorldTransform(runtime, targetParentId) : null;
      for (const nodeId of uniqueIds) {
        const currentNode = next.nodes[nodeId];
        const world = worldTransforms.get(nodeId);
        if (!currentNode || !world) {
          continue;
        }
        const local = worldPointToLocalPoint(runtime, targetParentId, {
          x: world.x,
          y: world.y,
        });
        const nextNode = withSyncedTransformFields({
          ...currentNode,
          parentId: targetParentId,
          transform: toNodeTransform({
            ...currentNode.transform,
            x: local.x,
            y: local.y,
            rotation: world.rotation - (parentWorldTransform?.rotation ?? 0),
          }),
        });
        if (!areEqual(currentNode, nextNode)) {
          next.nodes[nodeId] = nextNode;
          didChange = true;
        }
      }
    }
  } else if (command.type === "REORDER_CHILDREN") {
    const orderedIds = command.orderedIds.filter((nodeId) => Boolean(next.nodes[nodeId]));
    didChange = setChildOrder(next, command.parentId, orderedIds) || didChange;
  } else if (command.type === "TOGGLE_NODE_LOCK") {
    const node = next.nodes[command.id];
    if (node) {
      didChange = true;
      node.locked = !node.locked;
    }
  } else if (command.type === "TOGGLE_NODE_VISIBILITY") {
    const node = next.nodes[command.id];
    if (node) {
      didChange = true;
      node.visible = !node.visible;
    }
  } else if (command.type === "APPLY_IMAGE_ADJUSTMENTS") {
    const node = next.nodes[command.id];
    if (node?.type === "image") {
      if (!areEqual(node.adjustments, command.adjustments)) {
        node.adjustments = command.adjustments;
        didChange = true;
      }
    }
  }

  if (!didChange) {
    return {
      didChange: false,
      document,
      forwardPatch: EMPTY_PATCH,
      inversePatch: EMPTY_PATCH,
    };
  }

  next.updatedAt = new Date().toISOString();
  const nextDocument = resolveCanvasWorkbench(next);
  return {
    didChange: true,
    document: nextDocument,
    forwardPatch: createCanvasWorkbenchPatch(before, getCanvasWorkbenchSnapshot(nextDocument)),
    inversePatch: createCanvasWorkbenchPatch(getCanvasWorkbenchSnapshot(nextDocument), before),
  };
};
