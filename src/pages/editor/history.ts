import type {
  Asset,
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
} from "@/types";

export const MAX_HISTORY_PER_ASSET = 50;

export interface EditorAssetSnapshot {
  presetId: string | undefined;
  intensity: number | undefined;
  adjustments: EditingAdjustments | undefined;
  filmProfileId: string | undefined;
  filmProfile: FilmProfile | undefined;
  filmOverrides: FilmProfileOverrides | undefined;
}

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const cloneEditorAssetSnapshot = (
  snapshot: EditorAssetSnapshot
): EditorAssetSnapshot => cloneValue(snapshot);

export const createEditorAssetSnapshot = (asset: Asset): EditorAssetSnapshot => ({
  presetId: asset.presetId,
  intensity: asset.intensity,
  adjustments: asset.adjustments ? cloneValue(asset.adjustments) : undefined,
  filmProfileId: asset.filmProfileId,
  filmProfile: asset.filmProfile ? cloneValue(asset.filmProfile) : undefined,
  filmOverrides: asset.filmOverrides ? cloneValue(asset.filmOverrides) : undefined,
});

const serializeComparable = (value: unknown): string => JSON.stringify(value ?? null);

export const isEditorAssetSnapshotEqual = (
  a: EditorAssetSnapshot,
  b: EditorAssetSnapshot
): boolean =>
  a.presetId === b.presetId &&
  a.intensity === b.intensity &&
  serializeComparable(a.adjustments) === serializeComparable(b.adjustments) &&
  a.filmProfileId === b.filmProfileId &&
  serializeComparable(a.filmProfile) === serializeComparable(b.filmProfile) &&
  serializeComparable(a.filmOverrides) === serializeComparable(b.filmOverrides);

export const editorSnapshotToAssetPatch = (
  snapshot: EditorAssetSnapshot
): Partial<Asset> => ({
  presetId: snapshot.presetId,
  intensity: snapshot.intensity,
  adjustments: snapshot.adjustments ? cloneValue(snapshot.adjustments) : undefined,
  filmProfileId: snapshot.filmProfileId,
  filmProfile: snapshot.filmProfile ? cloneValue(snapshot.filmProfile) : undefined,
  filmOverrides: snapshot.filmOverrides ? cloneValue(snapshot.filmOverrides) : undefined,
});
