import { describe, expect, it } from "vitest";
import type { CanvasWorkbench } from "@/types";
import { normalizeCanvasWorkbench } from "./studioPresets";
import { planCanvasStoryPanelIntent } from "./storyPanelState";

type StoryWorkbenchOverrides = Partial<
  Pick<
    CanvasWorkbench,
    | "backgroundColor"
    | "guides"
    | "height"
    | "name"
    | "presetId"
    | "safeArea"
    | "slices"
    | "thumbnailBlob"
    | "width"
  >
>;

const createWorkbench = (overrides?: StoryWorkbenchOverrides): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id: "workbench-1",
  version: 5,
    ownerRef: { userId: "user-1" },
    name: "Workbench",
    width: 1080,
    height: 1350,
    presetId: "social-portrait",
    backgroundColor: "#000000",
    nodes: {},
    rootIds: [],
    slices: [],
    guides: {
      showCenter: false,
      showThirds: true,
      showSafeArea: true,
    },
    safeArea: {
      top: 72,
      right: 72,
      bottom: 72,
      left: 72,
    },
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
    ...overrides,
  });

describe("storyPanelState", () => {
  it("keeps slice count and order aligned when applying a preset", () => {
    const workbench = createWorkbench({
      slices: [
        { id: "slice-1", name: "One", x: 0, y: 0, width: 1080, height: 1350, order: 1 },
        { id: "slice-2", name: "Two", x: 1080, y: 0, width: 1080, height: 1350, order: 2 },
      ],
      width: 2160,
      height: 1350,
    });

    const plan = planCanvasStoryPanelIntent({
      intent: { type: "apply-preset", presetId: "social-square" },
      selectedSliceId: "slice-2",
      workbench,
    });

    expect(plan.patch.presetId).toBe("social-square");
    expect(plan.patch.width).toBe(2160);
    expect(plan.patch.height).toBe(1080);
    expect(plan.patch.slices).toEqual([
      { id: "slice-1", name: "One", x: 0, y: 0, width: 1080, height: 1080, order: 1 },
      { id: "slice-2", name: "Two", x: 1080, y: 0, width: 1080, height: 1080, order: 2 },
    ]);
    expect(plan.selectedSliceId).toBe("slice-2");
  });

  it("selects the first slice after building a strip", () => {
    const plan = planCanvasStoryPanelIntent({
      intent: { type: "build-strip-slices", count: 3 },
      selectedSliceId: null,
      workbench: createWorkbench(),
    });

    expect(plan.patch.width).toBe(3240);
    expect(plan.patch.slices).toHaveLength(3);
    expect(plan.patch.slices?.map((slice) => slice.order)).toEqual([1, 2, 3]);
    expect(plan.selectedSliceId).toBe(plan.patch.slices?.[0]?.id ?? null);
  });

  it("keeps the current selection valid after editing a slice", () => {
    const workbench = createWorkbench({
      slices: [
        { id: "slice-1", name: "One", x: 0, y: 0, width: 1080, height: 1350, order: 1 },
        { id: "slice-2", name: "Two", x: 1080, y: 0, width: 1080, height: 1350, order: 2 },
      ],
      width: 2160,
      height: 1350,
    });

    const plan = planCanvasStoryPanelIntent({
      intent: {
        type: "update-slice",
        sliceId: "slice-2",
        patch: { name: "Updated", width: 640 },
      },
      selectedSliceId: "slice-2",
      workbench,
    });

    expect(plan.patch.slices?.[1]).toMatchObject({
      id: "slice-2",
      name: "Updated",
      width: 640,
    });
    expect(plan.selectedSliceId).toBe("slice-2");
  });

  it("moves selection to the first remaining slice after deleting the selected slice", () => {
    const workbench = createWorkbench({
      slices: [
        { id: "slice-1", name: "One", x: 0, y: 0, width: 1080, height: 1350, order: 1 },
        { id: "slice-2", name: "Two", x: 1080, y: 0, width: 1080, height: 1350, order: 2 },
      ],
      width: 2160,
      height: 1350,
    });

    const plan = planCanvasStoryPanelIntent({
      intent: { type: "delete-slice", sliceId: "slice-2" },
      selectedSliceId: "slice-2",
      workbench,
    });

    expect(plan.patch.slices).toEqual([
      { id: "slice-1", name: "One", x: 0, y: 0, width: 1080, height: 1350, order: 1 },
    ]);
    expect(plan.selectedSliceId).toBe("slice-1");
  });
});
