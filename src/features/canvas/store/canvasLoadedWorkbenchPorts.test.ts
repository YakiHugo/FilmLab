import type {
  CanvasEditableElement,
  CanvasEditableGroupNode,
  CanvasRenderableTextElement,
} from "@/types";
import { describe, expect, it, vi } from "vitest";
import {
  bindCanvasLoadedWorkbenchHistoryActions,
  bindCanvasLoadedWorkbenchCommands,
  bindCanvasLoadedWorkbenchHistory,
  bindCanvasLoadedWorkbenchStructure,
} from "./canvasLoadedWorkbenchPorts";

const renderableTextNode = null as unknown as CanvasRenderableTextElement;
// @ts-expect-error runtime renderable nodes must not satisfy editable write inputs
const blockedRenderableEditableElement: CanvasEditableElement = renderableTextNode;
void blockedRenderableEditableElement;
const editableGroupNode = null as unknown as CanvasEditableGroupNode;
// @ts-expect-error structural group nodes must not satisfy public element upsert inputs
const blockedGroupEditableElement: CanvasEditableElement = editableGroupNode;
void blockedGroupEditableElement;

describe("canvasLoadedWorkbenchPorts", () => {
  it("binds command ports to the loaded workbench id", async () => {
    const patchWorkbench = vi.fn().mockResolvedValue({ id: "workbench-1" });
    const executeCommandInWorkbench = vi.fn().mockResolvedValue({ id: "workbench-1" });
    const beginInteractionInWorkbench = vi.fn().mockReturnValue({ interactionId: "interaction-1" });
    const previewCommandInWorkbench = vi.fn().mockReturnValue({ id: "workbench-1" });
    const commitInteractionInWorkbench = vi.fn().mockResolvedValue({ id: "workbench-1" });
    const rollbackInteractionInWorkbench = vi.fn().mockReturnValue({ id: "workbench-1" });
    const upsertElementInWorkbench = vi.fn().mockResolvedValue(undefined);
    const upsertElementsInWorkbench = vi.fn().mockResolvedValue(undefined);
    const commands = bindCanvasLoadedWorkbenchCommands({
      storeApi: {
        patchWorkbench,
        executeCommandInWorkbench,
        beginInteractionInWorkbench,
        previewCommandInWorkbench,
        commitInteractionInWorkbench,
        rollbackInteractionInWorkbench,
        upsertElementInWorkbench,
        upsertElementsInWorkbench,
      },
      workbenchId: "workbench-1",
    });
    const editableTextNode = {
      id: "node-1",
      type: "text" as const,
      parentId: null,
      transform: {
        x: 12,
        y: 18,
        width: 120,
        height: 48,
        rotation: 0,
      },
      x: 12,
      y: 18,
      width: 120,
      height: 48,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      color: "#ffffff",
      content: "Hello",
      fontFamily: "Georgia",
      fontSize: 24,
      fontSizeTier: "medium" as const,
      textAlign: "left" as const,
    };

    await commands.patchWorkbench({ name: "Renamed" });
    await commands.executeCommand({ type: "DELETE_NODES", ids: ["node-1"] });
    expect(commands.beginInteraction()).toEqual({ interactionId: "interaction-1" });
    expect(
      commands.previewCommand("interaction-1", {
        type: "PATCH_DOCUMENT",
        patch: { name: "Preview" },
      })
    ).toEqual({ id: "workbench-1" });
    await commands.commitInteraction("interaction-1");
    expect(commands.rollbackInteraction("interaction-1")).toEqual({ id: "workbench-1" });
    await commands.upsertElement(editableTextNode);
    await commands.upsertElements([{ ...editableTextNode, id: "node-2" }]);

    expect(patchWorkbench).toHaveBeenCalledWith("workbench-1", { name: "Renamed" }, undefined);
    expect(executeCommandInWorkbench).toHaveBeenCalledWith(
      "workbench-1",
      { type: "DELETE_NODES", ids: ["node-1"] },
      undefined
    );
    expect(beginInteractionInWorkbench).toHaveBeenCalledWith("workbench-1");
    expect(previewCommandInWorkbench).toHaveBeenCalledWith("workbench-1", "interaction-1", {
      type: "PATCH_DOCUMENT",
      patch: { name: "Preview" },
    });
    expect(commitInteractionInWorkbench).toHaveBeenCalledWith("workbench-1", "interaction-1");
    expect(rollbackInteractionInWorkbench).toHaveBeenCalledWith("workbench-1", "interaction-1");
    expect(upsertElementInWorkbench).toHaveBeenCalledWith("workbench-1", editableTextNode);
    expect(upsertElementsInWorkbench).toHaveBeenCalledWith("workbench-1", [
      { ...editableTextNode, id: "node-2" },
    ]);
  });

  it("returns null-safe no-op command contracts when no loaded workbench exists", async () => {
    const patchWorkbench = vi.fn();
    const executeCommandInWorkbench = vi.fn();
    const beginInteractionInWorkbench = vi.fn();
    const previewCommandInWorkbench = vi.fn();
    const commitInteractionInWorkbench = vi.fn();
    const rollbackInteractionInWorkbench = vi.fn();
    const upsertElementInWorkbench = vi.fn();
    const upsertElementsInWorkbench = vi.fn();
    const commands = bindCanvasLoadedWorkbenchCommands({
      storeApi: {
        patchWorkbench,
        executeCommandInWorkbench,
        beginInteractionInWorkbench,
        previewCommandInWorkbench,
        commitInteractionInWorkbench,
        rollbackInteractionInWorkbench,
        upsertElementInWorkbench,
        upsertElementsInWorkbench,
      },
      workbenchId: null,
    });
    const editableTextNode = {
      id: "node-1",
      type: "text" as const,
      parentId: null,
      transform: {
        x: 12,
        y: 18,
        width: 120,
        height: 48,
        rotation: 0,
      },
      x: 12,
      y: 18,
      width: 120,
      height: 48,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      color: "#ffffff",
      content: "Hello",
      fontFamily: "Georgia",
      fontSize: 24,
      fontSizeTier: "medium" as const,
      textAlign: "left" as const,
    };

    await expect(commands.patchWorkbench({ name: "noop" })).resolves.toBeNull();
    await expect(commands.executeCommand({ type: "DELETE_NODES", ids: ["node-1"] })).resolves.toBeNull();
    expect(commands.beginInteraction()).toBeNull();
    expect(
      commands.previewCommand("interaction-1", { type: "PATCH_DOCUMENT", patch: { name: "noop" } })
    ).toBeNull();
    await expect(commands.commitInteraction("interaction-1")).resolves.toBeNull();
    expect(commands.rollbackInteraction("interaction-1")).toBeNull();
    await expect(commands.upsertElement(editableTextNode)).resolves.toBeUndefined();
    await expect(commands.upsertElements([{ ...editableTextNode, id: "node-2" }])).resolves.toBeUndefined();

    expect(patchWorkbench).not.toHaveBeenCalled();
    expect(executeCommandInWorkbench).not.toHaveBeenCalled();
    expect(beginInteractionInWorkbench).not.toHaveBeenCalled();
    expect(previewCommandInWorkbench).not.toHaveBeenCalled();
    expect(commitInteractionInWorkbench).not.toHaveBeenCalled();
    expect(rollbackInteractionInWorkbench).not.toHaveBeenCalled();
    expect(upsertElementInWorkbench).not.toHaveBeenCalled();
    expect(upsertElementsInWorkbench).not.toHaveBeenCalled();
  });

  it("binds structure ports and keeps null-safe defaults for missing loaded workbench", async () => {
    const deleteNodesInWorkbench = vi.fn().mockResolvedValue(["node-1"]);
    const duplicateNodesInWorkbench = vi.fn().mockResolvedValue(["node-2"]);
    const groupNodesInWorkbench = vi.fn().mockResolvedValue("group-1");
    const nudgeElementsInWorkbench = vi.fn().mockResolvedValue(undefined);
    const reorderElementsInWorkbench = vi.fn().mockResolvedValue(undefined);
    const reparentNodesInWorkbench = vi.fn().mockResolvedValue(undefined);
    const toggleElementLockInWorkbench = vi.fn().mockResolvedValue(undefined);
    const toggleElementVisibilityInWorkbench = vi.fn().mockResolvedValue(undefined);
    const ungroupNodeInWorkbench = vi.fn().mockResolvedValue(undefined);

    const structure = bindCanvasLoadedWorkbenchStructure({
      storeApi: {
        deleteNodesInWorkbench,
        duplicateNodesInWorkbench,
        groupNodesInWorkbench,
        nudgeElementsInWorkbench,
        reorderElementsInWorkbench,
        reparentNodesInWorkbench,
        toggleElementLockInWorkbench,
        toggleElementVisibilityInWorkbench,
        ungroupNodeInWorkbench,
      },
      workbenchId: "workbench-1",
    });

    await expect(structure.deleteNodes(["node-1"])).resolves.toEqual(["node-1"]);
    await expect(structure.duplicateNodes(["node-1"])).resolves.toEqual(["node-2"]);
    await expect(structure.groupNodes(["node-1", "node-2"])).resolves.toBe("group-1");
    await expect(structure.nudgeElements(["node-1"], 1, 2)).resolves.toBeUndefined();
    await expect(structure.reorderElements(["node-1"], null)).resolves.toBeUndefined();
    await expect(structure.reparentNodes(["node-1"], null, 0)).resolves.toBeUndefined();
    await expect(structure.toggleElementLock("node-1")).resolves.toBeUndefined();
    await expect(structure.toggleElementVisibility("node-1")).resolves.toBeUndefined();
    await expect(structure.ungroupNode("group-1")).resolves.toBeUndefined();

    const nullStructure = bindCanvasLoadedWorkbenchStructure({
      storeApi: {
        deleteNodesInWorkbench,
        duplicateNodesInWorkbench,
        groupNodesInWorkbench,
        nudgeElementsInWorkbench,
        reorderElementsInWorkbench,
        reparentNodesInWorkbench,
        toggleElementLockInWorkbench,
        toggleElementVisibilityInWorkbench,
        ungroupNodeInWorkbench,
      },
      workbenchId: null,
    });

    await expect(nullStructure.deleteNodes(["node-1"])).resolves.toEqual([]);
    await expect(nullStructure.duplicateNodes(["node-1"])).resolves.toEqual([]);
    await expect(nullStructure.groupNodes(["node-1", "node-2"])).resolves.toBeNull();
    await expect(nullStructure.nudgeElements(["node-1"], 1, 2)).resolves.toBeUndefined();
    await expect(nullStructure.reorderElements(["node-1"], null)).resolves.toBeUndefined();
    await expect(nullStructure.reparentNodes(["node-1"], null, 0)).resolves.toBeUndefined();
    await expect(nullStructure.toggleElementLock("node-1")).resolves.toBeUndefined();
    await expect(nullStructure.toggleElementVisibility("node-1")).resolves.toBeUndefined();
    await expect(nullStructure.ungroupNode("group-1")).resolves.toBeUndefined();
  });

  it("binds history ports and returns false-based no-op promises when inactive", async () => {
    const redoInWorkbench = vi.fn().mockResolvedValue(true);
    const undoInWorkbench = vi.fn().mockResolvedValue(true);

    const history = bindCanvasLoadedWorkbenchHistory({
      canRedo: true,
      canUndo: true,
      storeApi: {
        redoInWorkbench,
        undoInWorkbench,
      },
      workbenchId: "workbench-1",
    });

    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);
    await expect(history.undo()).resolves.toBe(true);
    await expect(history.redo()).resolves.toBe(true);

    const nullHistory = bindCanvasLoadedWorkbenchHistory({
      canRedo: false,
      canUndo: false,
      storeApi: {
        redoInWorkbench,
        undoInWorkbench,
      },
      workbenchId: null,
    });

    expect(nullHistory.canUndo).toBe(false);
    expect(nullHistory.canRedo).toBe(false);
    await expect(nullHistory.undo()).resolves.toBe(false);
    await expect(nullHistory.redo()).resolves.toBe(false);
  });

  it("binds history action ports with the shared null-safe helper contract", async () => {
    const redoInWorkbench = vi.fn().mockResolvedValue(true);
    const undoInWorkbench = vi.fn().mockResolvedValue(true);

    const actions = bindCanvasLoadedWorkbenchHistoryActions({
      storeApi: {
        redoInWorkbench,
        undoInWorkbench,
      },
      workbenchId: "workbench-1",
    });

    await expect(actions.undo()).resolves.toBe(true);
    await expect(actions.redo()).resolves.toBe(true);
    expect(undoInWorkbench).toHaveBeenCalledWith("workbench-1");
    expect(redoInWorkbench).toHaveBeenCalledWith("workbench-1");

    const nullActions = bindCanvasLoadedWorkbenchHistoryActions({
      storeApi: {
        redoInWorkbench,
        undoInWorkbench,
      },
      workbenchId: null,
    });

    await expect(nullActions.undo()).resolves.toBe(false);
    await expect(nullActions.redo()).resolves.toBe(false);
  });
});
