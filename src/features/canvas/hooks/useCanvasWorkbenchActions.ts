import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasWorkbenchTransitionGuard } from "../canvasWorkbenchTransitionGuard";
import type {
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  PatchWorkbenchOptions,
} from "../store/canvasStoreTypes";
import {
  resolveCanvasWorkbenchName,
  resolveCanvasWorkbenchSequenceName,
} from "../workbenchPanelState";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";
import { useCanvasLoadedWorkbenchState } from "./useCanvasLoadedWorkbenchState";

export function useCanvasWorkbenchActions() {
  const navigate = useNavigate();
  const runBeforeWorkbenchTransition = useCanvasWorkbenchTransitionGuard();
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasLoadedWorkbenchState();
  const { patchWorkbench } = useCanvasLoadedWorkbenchCommands();
  const workbenches = useCanvasStore((state) => state.workbenchList);
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const deleteWorkbench = useCanvasStore((state) => state.deleteWorkbench);

  const awaitWorkbenchTransitionGuard = useCallback(async () => {
    try {
      await runBeforeWorkbenchTransition();
      return true;
    } catch {
      return false;
    }
  }, [runBeforeWorkbenchTransition]);

  const loadedWorkbenchMeta = useMemo(
    () => ({
      height: loadedWorkbench?.height ?? 0,
      id: loadedWorkbench?.id ?? null,
      name: loadedWorkbench?.name ?? "",
      presetId: loadedWorkbench?.presetId ?? "custom",
      updatedAt: loadedWorkbench?.updatedAt ?? "",
      width: loadedWorkbench?.width ?? 0,
    }),
    [loadedWorkbench]
  );

  const patchLoadedWorkbench = useCallback(
    (patch: CanvasWorkbenchEditablePatch, options?: PatchWorkbenchOptions) =>
      patchWorkbench(patch, options),
    [patchWorkbench]
  );

  const renameLoadedWorkbench = useCallback(
    async (name: string) =>
      patchLoadedWorkbench(
        {
          name: resolveCanvasWorkbenchName(name),
        },
        { trackHistory: false }
      ),
    [patchLoadedWorkbench]
  );

  const createWorkbenchAndNavigate = useCallback(
    async (name?: string, options?: CreateWorkbenchOptions) => {
      if (!(await awaitWorkbenchTransitionGuard())) {
        return null;
      }

      const created = await createWorkbench(name, {
        openAfterCreate: false,
        ...options,
      });
      if (!created) {
        return null;
      }

      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: created.id },
      });
      return created;
    },
    [awaitWorkbenchTransitionGuard, createWorkbench, navigate]
  );

  const createSequentialWorkbench = useCallback(
    async () => createWorkbenchAndNavigate(resolveCanvasWorkbenchSequenceName(workbenches.length + 1)),
    [createWorkbenchAndNavigate, workbenches.length]
  );

  const selectWorkbench = useCallback(
    async (workbenchId: string) => {
      if (workbenchId === loadedWorkbenchId) {
        return;
      }

      if (!(await awaitWorkbenchTransitionGuard())) {
        return;
      }
      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId },
      });
    },
    [awaitWorkbenchTransitionGuard, loadedWorkbenchId, navigate]
  );

  const deleteLoadedWorkbench = useCallback(async () => {
    if (!loadedWorkbenchId) {
      return false;
    }

    if (!(await awaitWorkbenchTransitionGuard())) {
      return false;
    }
    return deleteWorkbench(loadedWorkbenchId);
  }, [awaitWorkbenchTransitionGuard, deleteWorkbench, loadedWorkbenchId]);

  return {
    loadedWorkbench,
    loadedWorkbenchId,
    loadedWorkbenchMeta,
    createSequentialWorkbench,
    createWorkbenchAndNavigate,
    deleteLoadedWorkbench,
    patchLoadedWorkbench,
    renameLoadedWorkbench,
    selectWorkbench,
    workbenches,
  };
}
