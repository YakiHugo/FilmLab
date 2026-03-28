import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectCanvasCommittedWorkbenchState } from "../store/canvasStoreSelectors";

export function useCanvasCommittedWorkbenchState() {
  return useCanvasStore(selectCanvasCommittedWorkbenchState, shallow);
}
