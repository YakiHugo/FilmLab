export type CropGuideMode =
  | "thirds"
  | "diagonal"
  | "phiGrid"
  | "goldenTriangle"
  | "goldenSpiral"
  | "armature";

export interface CropGuideOption {
  id: CropGuideMode;
  label: string;
}

export const CROP_GUIDE_OPTIONS: CropGuideOption[] = [
  { id: "thirds", label: "Rule of Thirds" },
  { id: "diagonal", label: "Diagonal" },
  { id: "phiGrid", label: "Phi Grid" },
  { id: "goldenTriangle", label: "Golden Triangle" },
  { id: "goldenSpiral", label: "Golden Spiral" },
  { id: "armature", label: "Armature" },
];

export const DEFAULT_CROP_GUIDE_MODE: CropGuideMode = "thirds";

export const normalizeCropGuideRotation = (rotation: number) => {
  const normalizedTurns = Math.round(rotation) % 4;
  return (normalizedTurns + 4) % 4;
};

export const cycleCropGuideMode = (current: CropGuideMode): CropGuideMode => {
  const currentIndex = CROP_GUIDE_OPTIONS.findIndex((option) => option.id === current);
  if (currentIndex < 0) {
    return DEFAULT_CROP_GUIDE_MODE;
  }
  const nextIndex = (currentIndex + 1) % CROP_GUIDE_OPTIONS.length;
  return CROP_GUIDE_OPTIONS[nextIndex]?.id ?? DEFAULT_CROP_GUIDE_MODE;
};

export const resolveCropGuideLabel = (mode: CropGuideMode) =>
  CROP_GUIDE_OPTIONS.find((option) => option.id === mode)?.label ?? "Rule of Thirds";
