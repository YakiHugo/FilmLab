import { describe, expect, it } from "vitest";
import { resolveFloatingOverlayPosition, resolveToolbarMenuPlacement } from "./overlayGeometry";

describe("overlay geometry", () => {
  it("centers the floating overlay above the selection when space allows", () => {
    expect(
      resolveFloatingOverlayPosition({
        anchorRect: { x: 200, y: 180, width: 240, height: 80 },
        containerHeight: 600,
        containerWidth: 900,
        overlayHeight: 48,
        overlayWidth: 140,
      })
    ).toEqual({
      left: 250,
      top: 120,
    });
  });

  it("clamps the floating overlay inside the viewport and falls back below the selection", () => {
    expect(
      resolveFloatingOverlayPosition({
        anchorRect: { x: 12, y: 8, width: 120, height: 44 },
        containerHeight: 320,
        containerWidth: 240,
        overlayHeight: 56,
        overlayWidth: 180,
      })
    ).toEqual({
      left: 0,
      top: 64,
    });
  });

  it("flips the menu to the left when there is not enough room on the right", () => {
    expect(
      resolveToolbarMenuPlacement({
        containerHeight: 600,
        containerWidth: 900,
        gap: 10,
        menuHeight: 280,
        menuWidth: 180,
        padding: 8,
        toolbarRect: { x: 760, y: 100, width: 196, height: 48 },
      })
    ).toEqual({
      align: "right",
      maxHeight: 434,
      side: "bottom",
    });
  });

  it("limits menu height and opens upward when the viewport is short", () => {
    expect(
      resolveToolbarMenuPlacement({
        containerHeight: 220,
        containerWidth: 400,
        gap: 10,
        menuHeight: 280,
        menuWidth: 180,
        padding: 8,
        toolbarRect: { x: 120, y: 140, width: 196, height: 48 },
      })
    ).toEqual({
      align: "left",
      maxHeight: 122,
      side: "top",
    });
  });
});
