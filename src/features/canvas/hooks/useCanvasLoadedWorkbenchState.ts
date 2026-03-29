import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectCanvasLoadedWorkbenchState } from "../store/canvasStoreSelectors";

export function useCanvasLoadedWorkbenchState() {
  return useCanvasStore(selectCanvasLoadedWorkbenchState, shallow);
}
