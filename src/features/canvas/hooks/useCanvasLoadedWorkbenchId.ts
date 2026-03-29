import { useCanvasStore } from "@/stores/canvasStore";
import { selectResolvedLoadedWorkbenchId } from "../store/canvasStoreSelectors";

export function useCanvasLoadedWorkbenchId() {
  return useCanvasStore(selectResolvedLoadedWorkbenchId);
}
