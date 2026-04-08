import type { Asset } from "@/types";
import { describe, expect, it } from "vitest";
import { createCanvasImageElementFromAsset } from "./imageNodeFactory";

describe("imageNodeFactory", () => {
  it("creates a neutral render state on insert", () => {
    const asset: Asset = {
      id: "asset-1",
      name: "asset-1.jpg",
      type: "image/jpeg",
      size: 1024,
      createdAt: "2026-03-28T00:00:00.000Z",
      objectUrl: "blob:asset-1",
    };

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
          exposure: 0,
          contrast: 0,
        },
      },
      film: {
        profileId: null,
        profileOverrides: null,
      },
    });
  });
});
