import { describe, expect, it } from "vitest";
import {
  buildPreviewLayerRenderSlot,
  buildPreviewMainRenderSlot,
  buildPreviewRenderSlotPrefix,
} from "./requestUtils";

describe("preview request utils", () => {
  it("builds stable document-scoped preview slots", () => {
    const documentKey = "editor:asset-a";
    const prefix = buildPreviewRenderSlotPrefix(documentKey);

    expect(buildPreviewMainRenderSlot(documentKey)).toBe(`${prefix}:main`);
    expect(buildPreviewLayerRenderSlot(documentKey, "layer-a")).toBe(
      `${prefix}:layer:layer-a`
    );
    expect(buildPreviewLayerRenderSlot(documentKey, "layer-a", "single")).toBe(
      `${prefix}:layer:layer-a:single`
    );
    expect(buildPreviewLayerRenderSlot(documentKey, "layer-a", "composite")).toBe(
      `${prefix}:layer:layer-a:composite`
    );
  });
});
