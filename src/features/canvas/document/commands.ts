import type {
  CanvasCommand,
  CanvasDocumentChangeSet,
  CanvasDocumentMetaPatch,
  CanvasNodeId,
  CanvasNodePropertyPatch,
  CanvasNodeTransform,
  CanvasPersistedNode,
  CanvasRenderableNode,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { createId } from "@/utils";
import { normalizeCanvasTextElement } from "../textStyle";
import { canonicalizeCanvasImageNode } from "../imageRenderState";
import {
  collectWorldTransformById,
  getBoundsFromPoints,
  getCanvasNodeWorldTransform,
  rotatePoint,
  worldPointToLocalPoint,
} from "./geometry";
import { buildCanvasHierarchyIndex, normalizeCanvasHierarchy } from "./hierarchy";
import {
  getCanvasDescendantIds,
  getCanvasRenderableNode,
  getCanvasWorkbenchSnapshot,
  normalizeNode,
} from "./model";
import { resolveCanvasWorkbench } from "./resolve";
import { areEqual, clone, toNodeTransform } from "./shared";

const EMPTY_CHANGE_SET: CanvasDocumentChangeSet = { operations: [] };

const moveIdsInOrder = (ids: CanvasNodeId[], movingIds: CanvasNodeId[], index: number) => {
  const remaining = ids.filter((entry) => !movingIds.includes(entry));
  const insertIndex = Math.max(0, Math.min(index, remaining.length));
  const next = remaining.slice();
  next.splice(insertIndex, 0, ...movingIds);
  return next;
};

const insertIdsAtIndex = (ids: CanvasNodeId[], insertIds: CanvasNodeId[], index: number) => {
  const insertIndex = Math.max(0, Math.min(index, ids.length));
  const next = ids.slice();
  next.splice(insertIndex, 0, ...insertIds);
  return next;
};

const getChildOrder = (snapshot: CanvasWorkbenchSnapshot, parentId: CanvasNodeId | null) => {
  if (!parentId) {
    return snapshot.rootIds.slice();
  }
  return snapshot.nodes[parentId]?.type === "group"
    ? (snapshot.groupChildren[parentId] ?? []).slice()
    : [];
};

const isValidParentTarget = (
  snapshot: CanvasWorkbenchSnapshot,
  parentId: CanvasNodeId | null
) => !parentId || snapshot.nodes[parentId]?.type === "group";

const filterSelectedRoots = (
  snapshot: Pick<CanvasWorkbenchSnapshot, "groupChildren" | "nodes">,
  ids: CanvasNodeId[]
) =>
  ids.filter(
    (nodeId) =>
      !ids.some(
        (candidateId) =>
          candidateId !== nodeId &&
          getCanvasDescendantIds(snapshot, candidateId).includes(nodeId)
      )
  );

const hasDuplicateNodeIds = (ids: CanvasNodeId[]) => new Set(ids).size !== ids.length;

const hasPatchKey = <T extends object, K extends keyof T>(value: T, key: K): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const applyNodePropertyPatch = (
  node: CanvasPersistedNode,
  patch: CanvasNodePropertyPatch
): CanvasPersistedNode => {
  const nextTransform: CanvasNodeTransform = {
    x: patch.x ?? node.transform.x,
    y: patch.y ?? node.transform.y,
    width: patch.width ?? node.transform.width,
    height: patch.height ?? node.transform.height,
    rotation: patch.rotation ?? node.transform.rotation,
  };

  if (node.type === "group") {
    return {
      ...node,
      transform: toNodeTransform(nextTransform),
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      name: patch.name ?? node.name,
    };
  }

  if (node.type === "image") {
    return {
      ...node,
      transform: toNodeTransform(nextTransform),
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      renderState: hasPatchKey(patch, "renderState") ? clone(patch.renderState) : node.renderState,
    };
  }

  if (node.type === "text") {
    const normalized = normalizeCanvasTextElement({
      id: node.id,
      type: "text",
      parentId: null,
      transform: toNodeTransform(nextTransform),
      x: nextTransform.x,
      y: nextTransform.y,
      width: nextTransform.width,
      height: nextTransform.height,
      rotation: nextTransform.rotation,
      locked: patch.locked ?? node.locked,
      opacity: patch.opacity ?? node.opacity,
      visible: patch.visible ?? node.visible,
      zIndex: node.zIndex,
      color: patch.color ?? node.color,
      content: patch.content ?? node.content,
      fontFamily: patch.fontFamily ?? node.fontFamily,
      fontSize: patch.fontSize ?? node.fontSize,
      fontSizeTier: patch.fontSizeTier ?? node.fontSizeTier,
      textAlign: patch.textAlign ?? node.textAlign,
    });
    return normalizeNode(normalized);
  }

  return {
    ...node,
    transform: toNodeTransform(nextTransform),
    locked: patch.locked ?? node.locked,
    opacity: patch.opacity ?? node.opacity,
    visible: patch.visible ?? node.visible,
    arrowHead: hasPatchKey(patch, "arrowHead") ? patch.arrowHead : node.arrowHead,
    fill: patch.fill ?? node.fill,
    fillStyle: hasPatchKey(patch, "fillStyle") ? clone(patch.fillStyle) : node.fillStyle,
    points: hasPatchKey(patch, "points") ? patch.points : node.points,
    radius: hasPatchKey(patch, "radius") ? patch.radius : node.radius,
    shapeType: patch.shapeType ?? node.shapeType,
    stroke: patch.stroke ?? node.stroke,
    strokeWidth: patch.strokeWidth ?? node.strokeWidth,
  };
};

interface MutationRecorder {
  didChange: boolean;
  forward: CanvasDocumentChangeSet["operations"];
  inverse: CanvasDocumentChangeSet["operations"];
}

const createMutationRecorder = (): MutationRecorder => ({
  didChange: false,
  forward: [],
  inverse: [],
});

const recordOperation = (
  recorder: MutationRecorder,
  forward: CanvasDocumentChangeSet["operations"][number],
  inverse: CanvasDocumentChangeSet["operations"][number]
) => {
  recorder.didChange = true;
  recorder.forward.push(forward);
  recorder.inverse.unshift(inverse);
};

const applyDocumentMetaPatch = (
  snapshot: CanvasWorkbenchSnapshot,
  recorder: MutationRecorder,
  patch: CanvasDocumentMetaPatch
) => {
  const changedPatch: Record<string, unknown> = {};
  const inversePatch: Record<string, unknown> = {};
  const mutableSnapshot = snapshot as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch) as Array<
    [keyof CanvasDocumentMetaPatch, CanvasDocumentMetaPatch[keyof CanvasDocumentMetaPatch]]
  >) {
    if (value === undefined) {
      continue;
    }
    const currentValue = snapshot[key];
    if (areEqual(currentValue, value)) {
      continue;
    }
    changedPatch[key as string] = clone(value);
    inversePatch[key as string] = clone(currentValue);
    mutableSnapshot[key as string] = clone(value);
  }

  if (Object.keys(changedPatch).length > 0) {
    recordOperation(
      recorder,
      { type: "patchDocumentMeta", patch: changedPatch as CanvasDocumentMetaPatch },
      { type: "patchDocumentMeta", patch: inversePatch as CanvasDocumentMetaPatch }
    );
  }
};

const putNode = (
  snapshot: CanvasWorkbenchSnapshot,
  recorder: MutationRecorder,
  node: CanvasPersistedNode
) => {
  const current = snapshot.nodes[node.id];
  if (current && areEqual(current, node)) {
    return;
  }

  snapshot.nodes[node.id] = clone(node);
  recordOperation(
    recorder,
    { type: "putNode", node: clone(node) },
    current
      ? { type: "putNode", node: clone(current) }
      : { type: "deleteNode", nodeId: node.id }
  );
};

const deleteNode = (
  snapshot: CanvasWorkbenchSnapshot,
  recorder: MutationRecorder,
  nodeId: CanvasNodeId
) => {
  const current = snapshot.nodes[nodeId];
  if (!current) {
    return;
  }

  delete snapshot.nodes[nodeId];
  recordOperation(
    recorder,
    { type: "deleteNode", nodeId },
    { type: "putNode", node: clone(current) }
  );
};

const setRootOrder = (
  snapshot: CanvasWorkbenchSnapshot,
  recorder: MutationRecorder,
  rootIds: CanvasNodeId[]
) => {
  if (areEqual(snapshot.rootIds, rootIds)) {
    return;
  }

  const previous = snapshot.rootIds.slice();
  snapshot.rootIds = rootIds.slice();
  recordOperation(
    recorder,
    { type: "setRootOrder", rootIds: rootIds.slice() },
    { type: "setRootOrder", rootIds: previous }
  );
};

const setGroupChildren = (
  snapshot: CanvasWorkbenchSnapshot,
  recorder: MutationRecorder,
  groupId: CanvasNodeId,
  childIds: CanvasNodeId[]
) => {
  const previous = snapshot.groupChildren[groupId] ?? [];
  if (areEqual(previous, childIds)) {
    return;
  }

  if (childIds.length > 0) {
    snapshot.groupChildren[groupId] = childIds.slice();
  } else {
    delete snapshot.groupChildren[groupId];
  }

  recordOperation(
    recorder,
    { type: "setGroupChildren", groupId, childIds: childIds.slice() },
    { type: "setGroupChildren", groupId, childIds: previous.slice() }
  );
};

const collectSubtreeIdsPostOrder = (
  snapshot: Pick<CanvasWorkbenchSnapshot, "groupChildren" | "nodes">,
  nodeId: CanvasNodeId
): CanvasNodeId[] => {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    return [];
  }

  const subtree: CanvasNodeId[] = [];
  for (const childId of snapshot.groupChildren[nodeId] ?? []) {
    subtree.push(...collectSubtreeIdsPostOrder(snapshot, childId));
  }
  subtree.push(nodeId);
  return subtree;
};

const removeIdsFromOrder = (ids: CanvasNodeId[], removedIds: CanvasNodeId[]) =>
  ids.filter((entry) => !removedIds.includes(entry));

export interface ExecuteCanvasCommandResult {
  didChange: boolean;
  document: CanvasWorkbench;
  forwardChangeSet: CanvasDocumentChangeSet;
  inverseChangeSet: CanvasDocumentChangeSet;
}

export const executeCanvasCommand = (
  document: CanvasWorkbench,
  command: CanvasCommand
): ExecuteCanvasCommandResult => {
  const before = getCanvasWorkbenchSnapshot(document);
  const next = clone(before);
  const recorder = createMutationRecorder();

  if (command.type === "PATCH_DOCUMENT") {
    applyDocumentMetaPatch(next, recorder, command.patch);
  } else if (command.type === "INSERT_NODES") {
    const insertedIds = command.nodes.map((node) => node.id);
    const collisions = insertedIds.some((nodeId) => next.nodes[nodeId]);
    const duplicates = hasDuplicateNodeIds(insertedIds);

    if (!duplicates && !collisions) {
      const insertedNodeMap: Record<string, CanvasPersistedNode> = {};
      const parentHints: Record<string, CanvasNodeId | null | undefined> = {};
      const explicitGroupChildren: Record<string, CanvasNodeId[]> = {};

      for (const node of command.nodes) {
        const nextNode =
          node.type === "image" ? canonicalizeCanvasImageNode(node) : node;
        insertedNodeMap[nextNode.id] = normalizeNode(nextNode);
        parentHints[nextNode.id] = nextNode.parentId ?? null;
        if (nextNode.type === "group" && nextNode.childIds?.length) {
          explicitGroupChildren[nextNode.id] = nextNode.childIds.slice();
        }
      }

      const batchHierarchy = normalizeCanvasHierarchy({
        nodes: insertedNodeMap,
        rootIds: command.nodes
          .filter((node) => !node.parentId || !insertedNodeMap[node.parentId])
          .map((node) => node.id),
        groupChildren: explicitGroupChildren,
        parentHints,
      });

      const rootIdsByParent = new Map<CanvasNodeId | null, CanvasNodeId[]>();
      let hasInvalidExternalParent = false;

      for (const rootId of batchHierarchy.rootIds) {
        const source = command.nodes.find((node) => node.id === rootId) ?? null;
        const externalParentId =
          command.parentId !== undefined
            ? command.parentId ?? null
            : source?.parentId && !insertedNodeMap[source.parentId]
              ? source.parentId
              : null;
        if (!isValidParentTarget(next, externalParentId ?? null)) {
          hasInvalidExternalParent = true;
          break;
        }

        const group = rootIdsByParent.get(externalParentId ?? null) ?? [];
        group.push(rootId);
        rootIdsByParent.set(externalParentId ?? null, group);
      }

      if (!hasInvalidExternalParent) {
        for (const node of Object.values(insertedNodeMap)) {
          putNode(next, recorder, node);
        }

        for (const groupId of Object.keys(insertedNodeMap)) {
          const group = insertedNodeMap[groupId];
          if (group?.type !== "group") {
            continue;
          }
          setGroupChildren(next, recorder, groupId, batchHierarchy.groupChildren[groupId] ?? []);
        }

        for (const [parentId, batchRootIds] of rootIdsByParent) {
          const currentOrder = getChildOrder(next, parentId);
          const insertIndex =
            command.parentId !== undefined && parentId === (command.parentId ?? null)
              ? command.index ?? currentOrder.length
              : currentOrder.length;
          const nextOrder = insertIdsAtIndex(currentOrder, batchRootIds, insertIndex);
          if (!parentId) {
            setRootOrder(next, recorder, nextOrder);
          } else {
            setGroupChildren(next, recorder, parentId, nextOrder);
          }
        }
      }
    }
  } else if (command.type === "UPDATE_NODE_PROPS") {
    for (const update of command.updates) {
      const currentNode = next.nodes[update.id];
      if (!currentNode) {
        continue;
      }
      const nextNode = applyNodePropertyPatch(currentNode, update.patch);
      putNode(next, recorder, nextNode);
    }
  } else if (command.type === "MOVE_NODES") {
    const uniqueIds = filterSelectedRoots(
      next,
      Array.from(new Set(command.ids)).filter((nodeId) => Boolean(next.nodes[nodeId]))
    );
    const runtime = resolveCanvasWorkbench(next);

    for (const nodeId of uniqueIds) {
      const currentNode = next.nodes[nodeId];
      const currentRenderable = getCanvasRenderableNode(runtime, nodeId);
      if (!currentNode || !currentRenderable) {
        continue;
      }

      const parentTransform = currentRenderable.parentId
        ? getCanvasNodeWorldTransform(runtime, currentRenderable.parentId)
        : null;
      const localDelta = parentTransform
        ? rotatePoint({ x: command.dx, y: command.dy }, -parentTransform.rotation)
        : { x: command.dx, y: command.dy };
      const nextNode: CanvasPersistedNode = {
        ...currentNode,
        transform: toNodeTransform({
          ...currentNode.transform,
          x: currentNode.transform.x + localDelta.x,
          y: currentNode.transform.y + localDelta.y,
        }),
      };
      putNode(next, recorder, nextNode);
    }
  } else if (command.type === "DELETE_NODES") {
    const uniqueIds = filterSelectedRoots(
      next,
      Array.from(new Set(command.ids)).filter((nodeId) => Boolean(next.nodes[nodeId]))
    );
    const parentById = buildCanvasHierarchyIndex(next).parentById;

    for (const nodeId of uniqueIds) {
      const subtreeIds = collectSubtreeIdsPostOrder(next, nodeId);
      if (subtreeIds.length === 0) {
        continue;
      }

      const parentId = parentById[nodeId] ?? null;
      const currentOrder = getChildOrder(next, parentId);
      const nextOrder = removeIdsFromOrder(currentOrder, [nodeId]);

      if (!parentId) {
        setRootOrder(next, recorder, nextOrder);
      } else {
        setGroupChildren(next, recorder, parentId, nextOrder);
      }

      for (const subtreeId of subtreeIds) {
        if (next.nodes[subtreeId]?.type === "group") {
          setGroupChildren(next, recorder, subtreeId, []);
        }
        deleteNode(next, recorder, subtreeId);
      }
    }
  } else if (command.type === "GROUP_NODES") {
    const uniqueIds = filterSelectedRoots(
      next,
      Array.from(new Set(command.ids)).filter((nodeId) => Boolean(next.nodes[nodeId]))
    );
    const requestedGroupId = command.groupId ?? null;
    if (requestedGroupId && next.nodes[requestedGroupId]) {
      return {
        didChange: false,
        document,
        forwardChangeSet: EMPTY_CHANGE_SET,
        inverseChangeSet: EMPTY_CHANGE_SET,
      };
    }
    const parentById = buildCanvasHierarchyIndex(next).parentById;
    const selectedParentIds = Array.from(
      new Set(uniqueIds.map((nodeId) => parentById[nodeId] ?? null))
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
        const groupId = requestedGroupId ?? createId("node-id");
        const groupLocalOrigin = worldPointToLocalPoint(runtime, targetParentId, {
          x: bounds.x,
          y: bounds.y,
        });
        const targetParentTransform =
          targetParentId ? getCanvasNodeWorldTransform(runtime, targetParentId) : null;
        const groupWorldRotation = targetParentTransform?.rotation ?? 0;

        putNode(next, recorder, {
          id: groupId,
          type: "group",
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
          name: command.name ?? "Group",
        });
        setGroupChildren(next, recorder, groupId, orderedSelectedIds.slice());

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
          putNode(next, recorder, {
            ...currentNode,
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
        const nextOrder = insertIdsAtIndex(
          remainingSiblingIds,
          [groupId],
          insertIndex >= 0 ? insertIndex : remainingSiblingIds.length
        );
        if (!targetParentId) {
          setRootOrder(next, recorder, nextOrder);
        } else {
          setGroupChildren(next, recorder, targetParentId, nextOrder);
        }
      }
    }
  } else if (command.type === "UNGROUP_NODE") {
    const parentById = buildCanvasHierarchyIndex(next).parentById;
    const runtime = resolveCanvasWorkbench(next);
    const group = next.nodes[command.id];

    if (group?.type === "group") {
      const targetParentId = parentById[group.id] ?? null;
      const targetParentTransform =
        targetParentId ? getCanvasNodeWorldTransform(runtime, targetParentId) : null;
      const targetOrder = getChildOrder(next, targetParentId);
      const insertIndex = targetOrder.indexOf(group.id);
      const childIds = (next.groupChildren[group.id] ?? []).slice();

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
        putNode(next, recorder, {
          ...child,
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

      setGroupChildren(next, recorder, group.id, []);
      deleteNode(next, recorder, group.id);

      const remainingSiblingIds = targetOrder.filter((nodeId) => nodeId !== group.id);
      const nextOrder = insertIdsAtIndex(
        remainingSiblingIds,
        childIds,
        insertIndex >= 0 ? insertIndex : remainingSiblingIds.length
      );
      if (!targetParentId) {
        setRootOrder(next, recorder, nextOrder);
      } else {
        setGroupChildren(next, recorder, targetParentId, nextOrder);
      }
    }
  } else if (command.type === "REPARENT_NODES") {
    const uniqueIds = filterSelectedRoots(
      next,
      Array.from(new Set(command.ids)).filter((nodeId) => Boolean(next.nodes[nodeId]))
    );
    const targetParentId = command.parentId;
    const createsCycle =
      targetParentId !== null &&
      uniqueIds.some(
        (nodeId) =>
          nodeId === targetParentId ||
          getCanvasDescendantIds(next, nodeId).includes(targetParentId)
      );

    if (uniqueIds.length > 0 && isValidParentTarget(next, targetParentId) && !createsCycle) {
      const parentById = buildCanvasHierarchyIndex(next).parentById;
      const runtime = resolveCanvasWorkbench(next);
      const worldTransforms = collectWorldTransformById(runtime, uniqueIds);

      const idsByParent = new Map<CanvasNodeId | null, CanvasNodeId[]>();
      for (const nodeId of uniqueIds) {
        const parentId = parentById[nodeId] ?? null;
        const group = idsByParent.get(parentId) ?? [];
        group.push(nodeId);
        idsByParent.set(parentId, group);
      }

      for (const [parentId, ids] of idsByParent) {
        const currentOrder = getChildOrder(next, parentId);
        const nextOrder = removeIdsFromOrder(currentOrder, ids);
        if (!parentId) {
          setRootOrder(next, recorder, nextOrder);
        } else {
          setGroupChildren(next, recorder, parentId, nextOrder);
        }
      }

      const currentOrder = getChildOrder(next, targetParentId);
      const nextOrder = moveIdsInOrder(
        currentOrder,
        uniqueIds,
        command.index ?? currentOrder.length
      );
      if (!targetParentId) {
        setRootOrder(next, recorder, nextOrder);
      } else {
        setGroupChildren(next, recorder, targetParentId, nextOrder);
      }

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
        putNode(next, recorder, {
          ...currentNode,
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
    if (isValidParentTarget(next, command.parentId)) {
      const currentOrder = getChildOrder(next, command.parentId);
      const orderedIds = command.orderedIds.filter((nodeId) => Boolean(next.nodes[nodeId]));
      const orderedSet = new Set(orderedIds);
      const isCompleteSiblingReorder =
        orderedIds.length === currentOrder.length &&
        orderedSet.size === orderedIds.length &&
        currentOrder.every((nodeId) => orderedSet.has(nodeId));

      if (isCompleteSiblingReorder) {
        if (!command.parentId) {
          setRootOrder(next, recorder, orderedIds);
        } else {
          setGroupChildren(next, recorder, command.parentId, orderedIds);
        }
      }
    }
  } else if (command.type === "TOGGLE_NODE_LOCK") {
    const node = next.nodes[command.id];
    if (node) {
      putNode(next, recorder, {
        ...node,
        locked: !node.locked,
      });
    }
  } else if (command.type === "TOGGLE_NODE_VISIBILITY") {
    const node = next.nodes[command.id];
    if (node) {
      putNode(next, recorder, {
        ...node,
        visible: !node.visible,
      });
    }
  } else if (command.type === "SET_IMAGE_RENDER_STATE") {
    const node = next.nodes[command.id];
    if (node?.type === "image" && !areEqual(node.renderState, command.renderState)) {
      putNode(next, recorder, {
        ...node,
        renderState: clone(command.renderState),
        adjustments: undefined,
        filmProfileId: undefined,
      });
    }
  }

  if (!recorder.didChange) {
    return {
      didChange: false,
      document,
      forwardChangeSet: EMPTY_CHANGE_SET,
      inverseChangeSet: EMPTY_CHANGE_SET,
    };
  }

  applyDocumentMetaPatch(next, recorder, {
    updatedAt: new Date().toISOString(),
  });

  const nextDocument = resolveCanvasWorkbench(next);
  return {
    didChange: true,
    document: nextDocument,
    forwardChangeSet: { operations: recorder.forward },
    inverseChangeSet: { operations: recorder.inverse },
  };
};
