import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { shallow } from "zustand/shallow";
import { selectCanvasLoadedWorkbenchState } from "../store/canvasStoreSelectors";
import { useCanvasWorkbenchTransitionGuard } from "../canvasWorkbenchTransitionGuardHooks";
import type {
  CanvasWorkbenchEditablePatch,
  PatchWorkbenchOptions,
} from "../store/canvasStoreTypes";
import { resolveCanvasWorkbenchName } from "../workbenchPanelState";
import { useCanvasLoadedWorkbenchCommands } from "./useCanvasLoadedWorkbenchCommands";

export function useCanvasWorkbenchActions() {
  const navigate = useNavigate();
  const runBeforeWorkbenchTransition = useCanvasWorkbenchTransitionGuard();
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasStore(
    selectCanvasLoadedWorkbenchState,
    shallow
  );
  const { patchWorkbench } = useCanvasLoadedWorkbenchCommands();

  const awaitWorkbenchTransitionGuard = useCallback(async () => {
    try {
      await runBeforeWorkbenchTransition();
      return true;
    } catch {
      return false;
    }
  }, [runBeforeWorkbenchTransition]);

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

  const startNewCreation = useCallback(async () => {
    if (!(await awaitWorkbenchTransitionGuard())) {
      return false;
    }

    await navigate({
      to: "/",
    });
    return true;
  }, [awaitWorkbenchTransitionGuard, navigate]);

  return {
    loadedWorkbench,
    loadedWorkbenchId,
    loadedWorkbenchName: loadedWorkbench?.name ?? "",
    patchLoadedWorkbench,
    renameLoadedWorkbench,
    startNewCreation,
  };
}
