import { describe, expect, it } from "vitest";
import { buildImageRenderMaskRevisionKey } from "./effectMask";

describe("effectMask", () => {
  it("builds a stable revision key for equivalent masks", () => {
    const maskDefinition = {
      id: "mask-1",
      kind: "legacy-local-adjustment" as const,
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial" as const,
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.3,
        radiusY: 0.3,
        feather: 0.2,
      },
    };

    expect(buildImageRenderMaskRevisionKey(maskDefinition)).toBe(
      buildImageRenderMaskRevisionKey(maskDefinition)
    );
  });

  it("changes the revision key when the mask shape changes", () => {
    const first = buildImageRenderMaskRevisionKey({
      id: "mask-1",
      kind: "legacy-local-adjustment",
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial",
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.3,
        radiusY: 0.3,
        feather: 0.2,
      },
    });
    const second = buildImageRenderMaskRevisionKey({
      id: "mask-1",
      kind: "legacy-local-adjustment",
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial",
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.4,
        radiusY: 0.3,
        feather: 0.2,
      },
    });

    expect(first).not.toBe(second);
  });
});
