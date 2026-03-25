import { useEffect, useMemo, useState } from "react";
import type { CanvasWorkbench } from "@/types";
import {
  resolveOrderedCanvasSlices,
  resolveSelectedCanvasSliceId,
} from "../workbenchPanelState";

export function useCanvasSelectedSlice(activeWorkbench: CanvasWorkbench | null) {
  const [rawSelectedSliceId, setRawSelectedSliceId] = useState<string | null>(null);

  const orderedSlices = useMemo(
    () => resolveOrderedCanvasSlices(activeWorkbench),
    [activeWorkbench]
  );
  const selectedSliceId = resolveSelectedCanvasSliceId({
    orderedSlices,
    selectedSliceId: rawSelectedSliceId,
  });

  useEffect(() => {
    if (selectedSliceId !== rawSelectedSliceId) {
      setRawSelectedSliceId(selectedSliceId);
    }
  }, [rawSelectedSliceId, selectedSliceId]);

  return {
    selectSlice: setRawSelectedSliceId,
    selectedSliceId,
  };
}
