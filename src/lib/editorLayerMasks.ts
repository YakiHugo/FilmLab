import type {
  EditorLayerMask,
  EditorLayerMaskData,
  EditorLayerMaskMode,
} from "@/types";

export const createDefaultLayerMaskData = (mode: EditorLayerMaskMode): EditorLayerMaskData => {
  if (mode === "brush") {
    return {
      mode: "brush",
      points: [],
      brushSize: 0.08,
      feather: 0.55,
      flow: 1,
    };
  }
  if (mode === "radial") {
    return {
      mode: "radial",
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.35,
      radiusY: 0.35,
      feather: 0.45,
    };
  }
  if (mode === "linear") {
    return {
      mode: "linear",
      startX: 0.2,
      startY: 0.2,
      endX: 0.8,
      endY: 0.8,
      feather: 0.4,
    };
  }
  return {
    thresholdMin: 0,
    thresholdMax: 1,
    feather: 0.25,
  };
};

export const createDefaultLayerMask = (mode: EditorLayerMaskMode): EditorLayerMask => ({
  mode,
  inverted: false,
  data: createDefaultLayerMaskData(mode),
});
