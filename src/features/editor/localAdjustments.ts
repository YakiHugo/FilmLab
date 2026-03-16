import type { LocalAdjustment, LocalAdjustmentDelta, LocalAdjustmentMask } from "@/types";

export type LocalAdjustmentMaskMode = LocalAdjustmentMask["mode"];

const LOCAL_ID_PREFIX = "local";
const DEFAULT_LOCAL_AMOUNT = 100;

const createLocalAdjustmentId = () =>
  `${LOCAL_ID_PREFIX}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

export const createDefaultLocalMask = (
  mode: LocalAdjustmentMaskMode
): LocalAdjustmentMask => {
  if (mode === "linear") {
    return {
      mode,
      startX: 0.5,
      startY: 0.2,
      endX: 0.5,
      endY: 0.8,
      feather: 0.4,
      lumaMin: 0,
      lumaMax: 1,
      lumaFeather: 0,
      hueCenter: 0,
      hueRange: 180,
      hueFeather: 0,
      satMin: 0,
      satFeather: 0,
      invert: false,
    };
  }

  if (mode === "brush") {
    return {
      mode,
      points: [],
      brushSize: 0.08,
      feather: 0.55,
      flow: 0.85,
      lumaMin: 0,
      lumaMax: 1,
      lumaFeather: 0,
      hueCenter: 0,
      hueRange: 180,
      hueFeather: 0,
      satMin: 0,
      satFeather: 0,
      invert: false,
    };
  }

  return {
    mode: "radial",
    centerX: 0.5,
    centerY: 0.5,
    radiusX: 0.3,
    radiusY: 0.3,
    feather: 0.45,
    lumaMin: 0,
    lumaMax: 1,
    lumaFeather: 0,
    hueCenter: 0,
    hueRange: 180,
    hueFeather: 0,
    satMin: 0,
    satFeather: 0,
    invert: false,
  };
};

export const createLocalAdjustment = (mode: LocalAdjustmentMaskMode): LocalAdjustment => ({
  id: createLocalAdjustmentId(),
  enabled: true,
  amount: DEFAULT_LOCAL_AMOUNT,
  mask: createDefaultLocalMask(mode),
  adjustments: {},
});

export const cloneLocalAdjustment = (local: LocalAdjustment): LocalAdjustment => {
  const cloned =
    typeof structuredClone === "function"
      ? structuredClone(local)
      : (JSON.parse(JSON.stringify(local)) as LocalAdjustment);
  return {
    ...cloned,
    id: createLocalAdjustmentId(),
  };
};

export const resolveSelectedLocalAdjustment = (
  localAdjustments: LocalAdjustment[] | undefined,
  selectedLocalAdjustmentId: string | null
) => {
  const list = localAdjustments ?? [];
  if (list.length === 0) {
    return null;
  }
  if (selectedLocalAdjustmentId) {
    const selected = list.find((item) => item.id === selectedLocalAdjustmentId);
    if (selected) {
      return selected;
    }
  }
  return list[0] ?? null;
};

export const insertLocalAdjustmentAfter = (
  localAdjustments: LocalAdjustment[] | undefined,
  sourceLocalId: string | null,
  nextLocal: LocalAdjustment
) => {
  const list = localAdjustments ?? [];
  if (!sourceLocalId) {
    return [nextLocal, ...list];
  }
  const sourceIndex = list.findIndex((item) => item.id === sourceLocalId);
  if (sourceIndex < 0) {
    return [nextLocal, ...list];
  }
  const next = [...list];
  next.splice(sourceIndex + 1, 0, nextLocal);
  return next;
};

export const removeLocalAdjustmentById = (
  localAdjustments: LocalAdjustment[] | undefined,
  localId: string
) => (localAdjustments ?? []).filter((item) => item.id !== localId);

export const moveLocalAdjustmentByDirection = (
  localAdjustments: LocalAdjustment[] | undefined,
  localId: string,
  direction: "up" | "down"
) => {
  const list = [...(localAdjustments ?? [])];
  const currentIndex = list.findIndex((item) => item.id === localId);
  if (currentIndex < 0) {
    return list;
  }
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= list.length) {
    return list;
  }
  const [moved] = list.splice(currentIndex, 1);
  if (!moved) {
    return list;
  }
  list.splice(targetIndex, 0, moved);
  return list;
};

export const updateLocalAdjustmentById = (
  localAdjustments: LocalAdjustment[] | undefined,
  localId: string,
  updater: (local: LocalAdjustment) => LocalAdjustment
) =>
  (localAdjustments ?? []).map((item) => (item.id === localId ? updater(item) : item));

export const updateLocalAdjustmentDelta = (
  localAdjustments: LocalAdjustment[] | undefined,
  localId: string,
  patch: Partial<LocalAdjustmentDelta>
) =>
  updateLocalAdjustmentById(localAdjustments, localId, (local) => ({
    ...local,
    adjustments: {
      ...local.adjustments,
      ...patch,
    },
  }));
