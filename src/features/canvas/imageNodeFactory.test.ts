import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import { createCanvasImageElementFromAsset } from "./imageNodeFactory";

describe("imageNodeFactory", () => {
  it("snapshots canonical render state from the source asset on insert", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 18;
    adjustments.contrast = -12;
    const asset = {
      id: "asset-1",
      name: "asset-1.jpg",
      type: "image/jpeg",
      size: 1024,
      createdAt: "2026-03-28T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments,
      filmProfileId: "film-portrait-soft-v1",
      filmOverrides: {
        halation: {
          amount: 42,
        },
      },
      layers: [],
    } as const;

    const element = createCanvasImageElementFromAsset({
      asset,
      id: "image-1",
      x: 40,
      y: 60,
      width: 320,
      height: 240,
    });

    expect(element.renderState).toMatchObject({
      develop: {
        tone: {
          exposure: 18,
          contrast: -12,
        },
      },
      film: {
        profileId: "film-portrait-soft-v1",
        profileOverrides: {
          halation: {
            amount: 42,
          },
        },
      },
    });
  });
});
