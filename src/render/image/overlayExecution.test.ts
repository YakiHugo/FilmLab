import { describe, expect, it } from "vitest";
import type { SemanticOverlayNode } from "./types";
import { resolveImageOverlayLayoutScale, resolveImageOverlays } from "./overlayExecution";

const semanticOverlays: SemanticOverlayNode[] = [
  {
    id: "timestamp",
    type: "timestamp",
    enabled: true,
    params: { position: "bottom-right", size: 22, opacity: 72 },
  },
  {
    id: "caption",
    type: "caption",
    enabled: true,
    params: {
      text: "SYSTEM READY",
      position: "bottom",
      alignment: "center",
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "#000000",
      backgroundOpacity: 34,
      padding: 16,
      opacity: 100,
    },
  },
  {
    id: "watermark",
    type: "watermark",
    enabled: true,
    params: {
      text: "FILMLAB",
      opacity: 20,
      fontSize: 36,
      angle: -30,
      density: 1,
      color: "#ffffff",
    },
  },
];

describe("image overlay execution", () => {
  it("scales pixel-based layout values with render density", () => {
    const layoutScale = resolveImageOverlayLayoutScale({
      width: 2160,
      height: 2700,
      referenceWidth: 1080,
      referenceHeight: 1350,
    });
    const overlays = resolveImageOverlays({
      semanticOverlays,
      layoutScale,
      timestampText: "2026.07.11",
    });

    expect(layoutScale).toBe(2);
    expect(overlays).toMatchObject([
      { type: "timestamp", adjustments: { timestampSize: 44 } },
      { type: "caption", params: { fontSize: 48, padding: 32 } },
      { type: "watermark", params: { fontSize: 72, angle: -30, density: 1 } },
    ]);
  });

  it("uses the limiting axis for non-uniform targets and defaults without a reference", () => {
    expect(
      resolveImageOverlayLayoutScale({
        width: 2160,
        height: 1350,
        referenceWidth: 1080,
        referenceHeight: 1350,
      })
    ).toBe(1);
    expect(resolveImageOverlayLayoutScale({ width: 800, height: 600 })).toBe(1);
  });

  it("treats enabled overlays without visible content as no-ops", () => {
    const nonRenderingOverlays: SemanticOverlayNode[] = semanticOverlays.map(
      (overlay) => {
        switch (overlay.type) {
          case "timestamp":
            return { ...overlay, params: { ...overlay.params, opacity: 0 } };
          case "caption":
            return { ...overlay, params: { ...overlay.params, text: "   " } };
          case "watermark":
            return { ...overlay, params: { ...overlay.params, opacity: 0 } };
        }
      }
    );

    expect(
      resolveImageOverlays({
        semanticOverlays: nonRenderingOverlays,
        timestampText: "2026.07.12",
      })
    ).toEqual([]);
  });

  it("scales authored maximums beyond editor ranges and below preview minimums", () => {
    const maximums: SemanticOverlayNode[] = semanticOverlays.map((overlay) => {
      if (overlay.type === "timestamp") {
        return { ...overlay, params: { ...overlay.params, size: 48 } };
      }
      if (overlay.type === "caption") {
        return {
          ...overlay,
          params: { ...overlay.params, fontSize: 72, padding: 100 },
        };
      }
      return { ...overlay, params: { ...overlay.params, fontSize: 120 } };
    });

    expect(resolveImageOverlays({ semanticOverlays: maximums, layoutScale: 2 })).toMatchObject([
      { adjustments: { timestampSize: 96 } },
      { params: { fontSize: 144, padding: 200 } },
      { params: { fontSize: 240 } },
    ]);
    expect(resolveImageOverlays({ semanticOverlays, layoutScale: 0.25 })).toMatchObject([
      { adjustments: { timestampSize: 5.5 } },
      { params: { fontSize: 6, padding: 4 } },
      { params: { fontSize: 9 } },
    ]);
  });
});
