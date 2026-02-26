import { describe, expect, it } from "vitest";
import type { Asset } from "@/types";
import {
  buildWorkspaceFilterOptions,
  filterWorkspaceAssets,
  type WorkspaceFilterCriteria,
} from "./useWorkspaceFiltering";

const createAsset = (
  id: string,
  name: string,
  importDay: string,
  tags: string[] = []
): Asset => ({
  id,
  name,
  type: "image/jpeg",
  size: 100,
  createdAt: `${importDay}T08:00:00.000Z`,
  objectUrl: `blob://${id}`,
  importDay,
  tags,
});

const assets: Asset[] = [
  createAsset("a1", "portrait-a.jpg", "2026-02-26", ["Portrait", "Warm"]),
  createAsset("a2", "night-city.jpg", "2026-02-26", ["Night", "Street"]),
  createAsset("a3", "travel-mountain.jpg", "2026-02-25", ["Travel"]),
];

const applyFilter = (criteria: Partial<WorkspaceFilterCriteria>) =>
  filterWorkspaceAssets(assets, {
    searchText: "",
    selectedDay: "all",
    selectedTags: [],
    ...criteria,
  });

describe("useWorkspaceFiltering helpers", () => {
  it("builds day/tag options from assets", () => {
    const options = buildWorkspaceFilterOptions(assets);
    expect(options.dayOptions).toEqual(["2026-02-26", "2026-02-25"]);
    expect(options.tagOptions).toEqual(["Night", "Portrait", "Street", "Travel", "Warm"]);
  });

  it("filters by selected day", () => {
    const filtered = applyFilter({ selectedDay: "2026-02-25" });
    expect(filtered.map((asset) => asset.id)).toEqual(["a3"]);
  });

  it("matches selected tags with OR logic", () => {
    const filtered = applyFilter({ selectedTags: ["portrait", "travel"] });
    expect(filtered.map((asset) => asset.id)).toEqual(["a1", "a3"]);
  });

  it("supports combined day, tag and search filtering", () => {
    const filtered = applyFilter({
      selectedDay: "2026-02-26",
      selectedTags: ["street"],
      searchText: "city",
    });
    expect(filtered.map((asset) => asset.id)).toEqual(["a2"]);
  });
});

