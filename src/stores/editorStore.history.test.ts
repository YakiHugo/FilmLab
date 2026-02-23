import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { MAX_HISTORY_PER_ASSET, type EditorAssetSnapshot } from "@/features/editor/history";
import { useEditorStore } from "./editorStore";

const ASSET_ID = "asset-1";

const createSnapshot = (seed: number): EditorAssetSnapshot => ({
  presetId: `preset-${seed}`,
  intensity: seed,
  adjustments: {
    ...createDefaultAdjustments(),
    exposure: seed,
  },
  filmProfileId: undefined,
  filmProfile: undefined,
  filmOverrides: undefined,
});

const getAssetHistory = () => useEditorStore.getState().historyByAssetId[ASSET_ID];

describe("editorStore history", () => {
  beforeEach(() => {
    useEditorStore.getState().clearAllHistory();
  });

  it("trims past snapshots to max capacity", () => {
    const store = useEditorStore.getState();
    const overflowCount = 5;
    for (let i = 0; i < MAX_HISTORY_PER_ASSET + overflowCount; i += 1) {
      store.pushHistory(ASSET_ID, createSnapshot(i));
    }

    const history = getAssetHistory();
    expect(history?.past).toHaveLength(MAX_HISTORY_PER_ASSET);
    expect(history?.past[0]?.presetId).toBe(`preset-${overflowCount}`);
    expect(history?.past[MAX_HISTORY_PER_ASSET - 1]?.presetId).toBe(
      `preset-${MAX_HISTORY_PER_ASSET + overflowCount - 1}`
    );
  });

  it("moves snapshots between past and future on undo/redo", () => {
    const store = useEditorStore.getState();
    store.pushHistory(ASSET_ID, createSnapshot(1));
    store.pushHistory(ASSET_ID, createSnapshot(2));

    const undoSnapshot = store.undoSnapshot(ASSET_ID, createSnapshot(3));
    expect(undoSnapshot?.presetId).toBe("preset-2");
    expect(getAssetHistory()?.past.map((item) => item.presetId)).toEqual(["preset-1"]);
    expect(getAssetHistory()?.future.map((item) => item.presetId)).toEqual(["preset-3"]);

    const redoSnapshot = store.redoSnapshot(ASSET_ID, createSnapshot(2));
    expect(redoSnapshot?.presetId).toBe("preset-3");
    expect(getAssetHistory()?.past.map((item) => item.presetId)).toEqual(["preset-1", "preset-2"]);
    expect(getAssetHistory()?.future).toHaveLength(0);
  });

  it("clears future snapshots after a new edit post-undo", () => {
    const store = useEditorStore.getState();
    store.pushHistory(ASSET_ID, createSnapshot(1));
    store.pushHistory(ASSET_ID, createSnapshot(2));
    store.undoSnapshot(ASSET_ID, createSnapshot(3));

    store.pushHistory(ASSET_ID, createSnapshot(2));

    expect(getAssetHistory()?.past.map((item) => item.presetId)).toEqual(["preset-1", "preset-2"]);
    expect(getAssetHistory()?.future).toHaveLength(0);
  });

  it("ignores duplicate snapshots to avoid no-op history entries", () => {
    const store = useEditorStore.getState();
    const snapshot = createSnapshot(9);

    store.pushHistory(ASSET_ID, snapshot);
    store.pushHistory(ASSET_ID, snapshot);

    expect(getAssetHistory()?.past).toHaveLength(1);
  });
});
