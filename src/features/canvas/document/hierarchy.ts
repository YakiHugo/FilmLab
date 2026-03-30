import type {
  CanvasNodeId,
  CanvasPersistedNode,
  CanvasWorkbenchSnapshot,
} from "@/types";

export interface CanvasHierarchyIndex {
  orderedNodeIds: CanvasNodeId[];
  parentById: Record<CanvasNodeId, CanvasNodeId | null>;
}

const pushUnique = (target: CanvasNodeId[], id: CanvasNodeId) => {
  if (!target.includes(id)) {
    target.push(id);
  }
};

const sanitizeOrderedIds = (
  ids: CanvasNodeId[] | undefined,
  nodes: Record<string, CanvasPersistedNode>
) => {
  const next: CanvasNodeId[] = [];
  for (const nodeId of ids ?? []) {
    if (!nodes[nodeId]) {
      continue;
    }
    pushUnique(next, nodeId);
  }
  return next;
};

const sanitizeExplicitGroupChildren = (
  nodes: Record<string, CanvasPersistedNode>,
  groupChildren: Record<string, CanvasNodeId[]> | undefined
) => {
  const next: Record<string, CanvasNodeId[]> = {};
  for (const [groupId, childIds] of Object.entries(groupChildren ?? {})) {
    const group = nodes[groupId];
    if (!group || group.type !== "group") {
      continue;
    }
    const ordered = sanitizeOrderedIds(childIds, nodes).filter((childId) => childId !== groupId);
    if (ordered.length > 0) {
      next[groupId] = ordered;
    }
  }
  return next;
};

export const normalizeCanvasHierarchy = ({
  groupChildren,
  nodes,
  parentHints,
  rootIds,
}: {
  groupChildren?: Record<string, CanvasNodeId[]>;
  nodes: Record<string, CanvasPersistedNode>;
  parentHints?: Record<string, CanvasNodeId | null | undefined>;
  rootIds?: CanvasNodeId[];
}): Pick<CanvasWorkbenchSnapshot, "groupChildren" | "rootIds"> => {
  const explicitGroupChildren = sanitizeExplicitGroupChildren(nodes, groupChildren);
  const explicitRootIds = sanitizeOrderedIds(rootIds, nodes);
  const preferredParent = new Map<CanvasNodeId, CanvasNodeId | null>();

  for (const nodeId of Object.keys(nodes)) {
    const hintedParent = parentHints?.[nodeId];
    const nextParent =
      hintedParent && nodes[hintedParent]?.type === "group" && hintedParent !== nodeId
        ? hintedParent
        : null;
    preferredParent.set(nodeId, nextParent);
  }

  for (const [groupId, childIds] of Object.entries(explicitGroupChildren)) {
    for (const childId of childIds) {
      preferredParent.set(childId, groupId);
    }
  }

  const orderedChildrenByParent = new Map<CanvasNodeId, CanvasNodeId[]>();
  for (const [groupId, childIds] of Object.entries(explicitGroupChildren)) {
    orderedChildrenByParent.set(groupId, childIds.slice());
  }

  for (const nodeId of Object.keys(nodes)) {
    const parentId = preferredParent.get(nodeId) ?? null;
    if (!parentId) {
      continue;
    }
    const ordered = orderedChildrenByParent.get(parentId) ?? [];
    pushUnique(ordered, nodeId);
    orderedChildrenByParent.set(parentId, ordered);
  }

  const rootCandidates: CanvasNodeId[] = [];
  const childSet = new Set(
    Array.from(orderedChildrenByParent.values()).flatMap((childIds) => childIds)
  );

  for (const rootId of explicitRootIds) {
    if (!childSet.has(rootId)) {
      pushUnique(rootCandidates, rootId);
    }
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!childSet.has(nodeId)) {
      pushUnique(rootCandidates, nodeId);
    }
  }

  const seen = new Set<CanvasNodeId>();
  const stack = new Set<CanvasNodeId>();
  const finalRootIds: CanvasNodeId[] = [];
  const finalGroupChildren: Record<string, CanvasNodeId[]> = {};

  const visit = (nodeId: CanvasNodeId, parentId: CanvasNodeId | null) => {
    if (!nodes[nodeId] || seen.has(nodeId) || stack.has(nodeId)) {
      return;
    }

    seen.add(nodeId);
    stack.add(nodeId);
    if (parentId === null) {
      finalRootIds.push(nodeId);
    } else {
      const ordered = finalGroupChildren[parentId] ?? [];
      ordered.push(nodeId);
      finalGroupChildren[parentId] = ordered;
    }

    if (nodes[nodeId]!.type === "group") {
      for (const childId of orderedChildrenByParent.get(nodeId) ?? []) {
        visit(childId, nodeId);
      }
    }

    stack.delete(nodeId);
  };

  for (const rootId of rootCandidates) {
    visit(rootId, null);
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!seen.has(nodeId)) {
      visit(nodeId, null);
    }
  }

  return {
    rootIds: finalRootIds,
    groupChildren: finalGroupChildren,
  };
};

export const buildCanvasHierarchyIndex = (
  snapshot: Pick<CanvasWorkbenchSnapshot, "groupChildren" | "nodes" | "rootIds">
): CanvasHierarchyIndex => {
  const orderedNodeIds: CanvasNodeId[] = [];
  const parentById: Record<string, CanvasNodeId | null> = {};
  const seen = new Set<CanvasNodeId>();
  const stack = new Set<CanvasNodeId>();

  const visit = (nodeId: CanvasNodeId, parentId: CanvasNodeId | null) => {
    const node = snapshot.nodes[nodeId];
    if (!node) {
      throw new Error(`Canvas hierarchy references missing node "${nodeId}".`);
    }
    if (stack.has(nodeId)) {
      throw new Error(`Canvas hierarchy contains a cycle at "${nodeId}".`);
    }
    if (seen.has(nodeId)) {
      throw new Error(`Canvas hierarchy references "${nodeId}" more than once.`);
    }

    seen.add(nodeId);
    stack.add(nodeId);
    parentById[nodeId] = parentId;
    orderedNodeIds.push(nodeId);

    const childIds = snapshot.groupChildren[nodeId] ?? [];
    if (childIds.length > 0 && node.type !== "group") {
      throw new Error(`Non-group node "${nodeId}" cannot own children.`);
    }

    const localSeen = new Set<CanvasNodeId>();
    for (const childId of childIds) {
      if (localSeen.has(childId)) {
        throw new Error(`Group "${nodeId}" lists child "${childId}" more than once.`);
      }
      localSeen.add(childId);
      visit(childId, nodeId);
    }

    stack.delete(nodeId);
  };

  for (const rootId of snapshot.rootIds) {
    visit(rootId, null);
  }

  for (const groupId of Object.keys(snapshot.groupChildren)) {
    const group = snapshot.nodes[groupId];
    if (!group) {
      throw new Error(`Canvas groupChildren references missing group "${groupId}".`);
    }
    if (group.type !== "group") {
      throw new Error(`Canvas groupChildren key "${groupId}" is not a group.`);
    }
  }

  const missingNodeIds = Object.keys(snapshot.nodes).filter((nodeId) => !seen.has(nodeId));
  if (missingNodeIds.length > 0) {
    throw new Error(`Canvas hierarchy leaves nodes unplaced: ${missingNodeIds.join(", ")}.`);
  }

  return {
    orderedNodeIds,
    parentById,
  };
};

export const getCanvasParentId = (
  snapshot: Pick<CanvasWorkbenchSnapshot, "groupChildren" | "nodes" | "rootIds">,
  nodeId: CanvasNodeId
) => buildCanvasHierarchyIndex(snapshot).parentById[nodeId] ?? null;
