import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectCanvasActiveWorkbenchState } from "../store/canvasStoreSelectors";

export function useCanvasActiveWorkbenchState() {
  return useCanvasStore(selectCanvasActiveWorkbenchState, shallow);
}
