import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import type {
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  PatchWorkbenchOptions,
} from "../store/canvasStoreTypes";
import {
  resolveCanvasWorkbenchName,
  resolveCanvasWorkbenchSequenceName,
} from "../workbenchPanelState";
import { useCanvasActiveWorkbenchCommands } from "./useCanvasActiveWorkbenchCommands";
import { useCanvasActiveWorkbenchState } from "./useCanvasActiveWorkbenchState";

export function useCanvasWorkbenchActions() {
  const navigate = useNavigate();
  const { activeWorkbench, activeWorkbenchId } = useCanvasActiveWorkbenchState();
  const { patchWorkbench } = useCanvasActiveWorkbenchCommands();
  const workbenches = useCanvasStore((state) => state.workbenchList);
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const deleteWorkbench = useCanvasStore((state) => state.deleteWorkbench);

  const activeWorkbenchMeta = useMemo(
    () => ({
      height: activeWorkbench?.height ?? 0,
      id: activeWorkbench?.id ?? null,
      name: activeWorkbench?.name ?? "",
      presetId: activeWorkbench?.presetId ?? "custom",
      updatedAt: activeWorkbench?.updatedAt ?? "",
      width: activeWorkbench?.width ?? 0,
    }),
    [activeWorkbench]
  );

  const patchActiveWorkbench = useCallback(
    (patch: CanvasWorkbenchEditablePatch, options?: PatchWorkbenchOptions) =>
      patchWorkbench(patch, options),
    [patchWorkbench]
  );

  const renameActiveWorkbench = useCallback(
    async (name: string) =>
      patchActiveWorkbench(
        {
          name: resolveCanvasWorkbenchName(name),
        },
        { trackHistory: false }
      ),
    [patchActiveWorkbench]
  );

  const createWorkbenchAndNavigate = useCallback(
    async (name?: string, options?: CreateWorkbenchOptions) => {
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
    [createWorkbench, navigate]
  );

  const createSequentialWorkbench = useCallback(
    async () => createWorkbenchAndNavigate(resolveCanvasWorkbenchSequenceName(workbenches.length + 1)),
    [createWorkbenchAndNavigate, workbenches.length]
  );

  const selectWorkbench = useCallback(
    async (workbenchId: string) => {
      if (workbenchId === activeWorkbenchId) {
        return;
      }

      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId },
      });
    },
    [activeWorkbenchId, navigate]
  );

  const deleteActiveWorkbench = useCallback(async () => {
    if (!activeWorkbenchId) {
      return false;
    }

    return deleteWorkbench(activeWorkbenchId);
  }, [activeWorkbenchId, deleteWorkbench]);

  return {
    activeWorkbench,
    activeWorkbenchId,
    activeWorkbenchMeta,
    createSequentialWorkbench,
    createWorkbenchAndNavigate,
    deleteActiveWorkbench,
    patchActiveWorkbench,
    renameActiveWorkbench,
    selectWorkbench,
    workbenches,
  };
}
