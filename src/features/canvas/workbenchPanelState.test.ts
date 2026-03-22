import { describe, expect, it } from "vitest";
import { resolveCanvasWorkbenchName, resolveCanvasWorkbenchSequenceName, resolveSelectedCanvasSliceId } from "./workbenchPanelState";

describe("workbenchPanelState", () => {
  it("falls back to the default workbench name when the input is blank", () => {
    expect(resolveCanvasWorkbenchName("   ")).toBe("Untitled Workbench");
  });

  it("formats sequence names with a stable two-digit suffix", () => {
    expect(resolveCanvasWorkbenchSequenceName(3)).toBe("Workbench 03");
  });

  it("keeps the selected slice id when it is still valid", () => {
    expect(
      resolveSelectedCanvasSliceId({
        orderedSlices: [
          { id: "slice-1", name: "One", x: 0, y: 0, width: 100, height: 100, order: 1 },
          { id: "slice-2", name: "Two", x: 100, y: 0, width: 100, height: 100, order: 2 },
        ],
        selectedSliceId: "slice-2",
      })
    ).toBe("slice-2");
  });

  it("falls back to the first slice id when the current selection is invalid", () => {
    expect(
      resolveSelectedCanvasSliceId({
        orderedSlices: [
          { id: "slice-1", name: "One", x: 0, y: 0, width: 100, height: 100, order: 1 },
          { id: "slice-2", name: "Two", x: 100, y: 0, width: 100, height: 100, order: 2 },
        ],
        selectedSliceId: "missing-slice",
      })
    ).toBe("slice-1");
  });
});
