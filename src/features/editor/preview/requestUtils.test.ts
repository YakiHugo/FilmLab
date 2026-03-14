import { describe, expect, it } from "vitest";
import { buildPreviewRenderSlot, buildPreviewRenderSlotPrefix } from "./requestUtils";

describe("buildPreviewRenderSlot", () => {
  it("builds a stable slot prefix per document", () => {
    expect(buildPreviewRenderSlotPrefix("editor:asset-a")).toBe("preview:editor:asset-a");
  });

  it("isolates preview slots by document key", () => {
    expect(buildPreviewRenderSlot("editor:asset-a")).not.toBe(
      buildPreviewRenderSlot("editor:asset-b")
    );
  });

  it("keeps suffixes stable for layer previews", () => {
    expect(buildPreviewRenderSlot("editor:asset-a", "layer:base")).toBe(
      "preview:editor:asset-a:layer:base"
    );
  });
});
