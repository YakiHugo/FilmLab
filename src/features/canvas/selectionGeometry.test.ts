import { describe, expect, it } from "vitest";
import {
  isSelectableSelectionTarget,
  mergeSelectionIds,
  normalizeSelectionRect,
  rectsIntersect,
  resolveSelectableSelectionIds,
  resolveCompletedMarqueeSelectionIds,
  resolveIntersectingSelectionIds,
  resolveMarqueeSelectionIds,
  screenRectToWorldRect,
  selectionDistanceExceedsThreshold,
} from "./selectionGeometry";

describe("selection geometry", () => {
  it("normalizes drag points into a top-left anchored selection rect", () => {
    expect(normalizeSelectionRect({ x: 120, y: 90 }, { x: 40, y: 30 })).toEqual({
      x: 40,
      y: 30,
      width: 80,
      height: 60,
    });
  });

  it("treats overlapping bounds as selected when rectangles intersect", () => {
    expect(
      rectsIntersect(
        { x: 100, y: 100, width: 80, height: 60 },
        { x: 160, y: 120, width: 50, height: 50 }
      )
    ).toBe(true);
    expect(
      rectsIntersect(
        { x: 100, y: 100, width: 40, height: 40 },
        { x: 141, y: 141, width: 40, height: 40 }
      )
    ).toBe(false);
  });

  it("collects all ids whose cached bounds intersect the marquee rect", () => {
    expect(
      resolveIntersectingSelectionIds({ x: 100, y: 80, width: 160, height: 120 }, [
        { id: "a", rect: { x: 80, y: 70, width: 40, height: 40 } },
        { id: "b", rect: { x: 180, y: 120, width: 40, height: 40 } },
        { id: "c", rect: { x: 320, y: 220, width: 60, height: 60 } },
      ])
    ).toEqual(["a", "b"]);
  });

  it("merges marquee hits into the base selection only for additive drags", () => {
    expect(mergeSelectionIds(["base-a"], ["hit-a", "hit-b"], true)).toEqual([
      "base-a",
      "hit-a",
      "hit-b",
    ]);
    expect(mergeSelectionIds(["base-a"], ["hit-a", "hit-b"], false)).toEqual(["hit-a", "hit-b"]);
  });

  it("uses the same ids for marquee preview and final commit after activation", () => {
    const previewIds = resolveMarqueeSelectionIds(
      { x: 100, y: 80, width: 160, height: 120 },
      [
        { id: "base-a", rect: { x: 80, y: 70, width: 40, height: 40 } },
        { id: "hit-b", rect: { x: 180, y: 120, width: 40, height: 40 } },
      ],
      ["base-a"],
      true
    );

    expect(
      resolveCompletedMarqueeSelectionIds({
        additive: true,
        baseSelectedIds: ["base-a"],
        hasActivated: true,
        nextSelectedIds: previewIds,
      })
    ).toEqual(previewIds);
  });

  it("clears or restores the base selection when the marquee never activates", () => {
    expect(
      resolveCompletedMarqueeSelectionIds({
        additive: false,
        baseSelectedIds: ["base-a"],
        hasActivated: false,
        nextSelectedIds: ["ignored"],
      })
    ).toEqual([]);

    expect(
      resolveCompletedMarqueeSelectionIds({
        additive: true,
        baseSelectedIds: ["base-a"],
        hasActivated: false,
        nextSelectedIds: ["ignored"],
      })
    ).toEqual(["base-a"]);
  });

  it("uses the configured screen-space threshold before drag selection becomes active", () => {
    expect(selectionDistanceExceedsThreshold({ x: 20, y: 20 }, { x: 22, y: 23 }, 4)).toBe(false);
    expect(selectionDistanceExceedsThreshold({ x: 20, y: 20 }, { x: 24, y: 23 }, 4)).toBe(true);
  });

  it("converts screen-space bounds back into world-space using viewport and zoom", () => {
    expect(
      screenRectToWorldRect({ x: 260, y: 180, width: 320, height: 160 }, { x: 100, y: 60 }, 2)
    ).toEqual({
      x: 80,
      y: 60,
      width: 160,
      height: 80,
    });
  });

  it("only treats unlocked and visible targets as marquee-selectable", () => {
    expect(isSelectableSelectionTarget({ effectiveLocked: false, effectiveVisible: true })).toBe(
      true
    );
    expect(isSelectableSelectionTarget({ effectiveLocked: true, effectiveVisible: true })).toBe(
      false
    );
    expect(isSelectableSelectionTarget({ effectiveLocked: false, effectiveVisible: false })).toBe(
      false
    );
  });

  it("filters resolved selection ids to selectable nodes only", () => {
    expect(
      resolveSelectableSelectionIds(
        [
          { id: "visible", effectiveLocked: false, effectiveVisible: true },
          { id: "locked", effectiveLocked: true, effectiveVisible: true },
          { id: "hidden", effectiveLocked: false, effectiveVisible: false },
        ],
        ["visible", "locked", "hidden"]
      )
    ).toEqual(["visible"]);
  });
});
