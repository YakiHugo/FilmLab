import { describe, expect, it } from "vitest";
import type { Asset, CanvasWorkbenchListEntry } from "@/types";
import { resolveRecentWorkbenchCards } from "./recentWorkbenches";

const createAsset = (id: string): Asset => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg",
  size: 1024,
  createdAt: "2026-07-01T00:00:00.000Z",
  objectUrl: `blob:${id}`,
});

const createWorkbench = (
  id: string,
  updatedAt: string,
  coverAssetId: string | null = null
): CanvasWorkbenchListEntry => ({
  id,
  name: id,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt,
  presetId: "social-portrait",
  width: 1080,
  height: 1350,
  elementCount: 1,
  coverAssetId,
});

describe("resolveRecentWorkbenchCards", () => {
  it("returns the most recently updated workbenches without mutating the store list", () => {
    const workbenches = [
      createWorkbench("older", "2026-07-12T00:00:00.000Z"),
      createWorkbench("newest", "2026-07-14T00:00:00.000Z"),
      createWorkbench("middle", "2026-07-13T00:00:00.000Z"),
    ];

    const cards = resolveRecentWorkbenchCards({
      assets: [],
      limit: 2,
      workbenches,
    });

    expect(cards.map(({ workbench }) => workbench.id)).toEqual(["newest", "middle"]);
    expect(workbenches.map((workbench) => workbench.id)).toEqual(["older", "newest", "middle"]);
  });

  it("keeps projects reachable when their cover asset is absent", () => {
    const availableCover = createAsset("asset-available");

    const cards = resolveRecentWorkbenchCards({
      assets: [availableCover],
      workbenches: [
        createWorkbench("available", "2026-07-14T00:00:00.000Z", availableCover.id),
        createWorkbench("missing", "2026-07-13T00:00:00.000Z", "asset-missing"),
      ],
    });

    expect(cards[0]).toMatchObject({
      workbench: { id: "available" },
      coverAsset: availableCover,
    });
    expect(cards[1]).toMatchObject({
      workbench: { id: "missing" },
      coverAsset: null,
    });
  });
});
