import { useCanvasStore } from "@/stores/canvasStore";
import { selectResolvedActiveWorkbenchId } from "../store/canvasStoreSelectors";

export function useCanvasActiveWorkbenchId() {
  return useCanvasStore(selectResolvedActiveWorkbenchId);
}
