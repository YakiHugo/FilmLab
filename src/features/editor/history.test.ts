import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createEditorAssetSnapshot, isEditorAssetSnapshotEqual } from "./history";

describe("editor history snapshots", () => {
  it("treats layer adjustment visibility as a document change", () => {
    const adjustments = createDefaultAdjustments();
    const createAsset = (basicVisible: boolean) => ({
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 1,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments,
      layers: [
        {
          id: "base-1",
          name: "Background",
          type: "base" as const,
          visible: true,
          opacity: 100,
          blendMode: "normal" as const,
          adjustments,
          adjustmentVisibility: {
            basic: basicVisible,
            effects: true,
            detail: true,
          },
        },
      ],
    });

    const visibleSnapshot = createEditorAssetSnapshot(createAsset(true));
    const hiddenSnapshot = createEditorAssetSnapshot(createAsset(false));

    expect(isEditorAssetSnapshotEqual(visibleSnapshot, hiddenSnapshot)).toBe(false);
  });

  it("treats ascii adjustment changes as a document change", () => {
    const baseAdjustments = createDefaultAdjustments();
    const createAsset = (asciiEnabled: boolean) => ({
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 1,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments: {
        ...baseAdjustments,
        ascii: {
          ...baseAdjustments.ascii!,
          enabled: asciiEnabled,
        },
      },
      layers: [],
    });

    const disabledSnapshot = createEditorAssetSnapshot(createAsset(false));
    const enabledSnapshot = createEditorAssetSnapshot(createAsset(true));

    expect(isEditorAssetSnapshotEqual(disabledSnapshot, enabledSnapshot)).toBe(false);
  });
});
