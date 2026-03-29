import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectCanvasCommittedLoadedWorkbenchState } from "../store/canvasStoreSelectors";

export function useCanvasCommittedLoadedWorkbenchState() {
  return useCanvasStore(selectCanvasCommittedLoadedWorkbenchState, shallow);
}
