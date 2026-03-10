import { describe, expect, it } from "vitest";
import { storeGeneratedImage } from "../shared/generatedImageStore";

describe("uploadAssetIfNeeded", () => {
  it("converts generated-image references for providers that require upload strategy", async () => {
    await import("./registry");
    const { uploadAssetIfNeeded } = await import("./upload");

    const imageId = storeGeneratedImage(Buffer.from([1, 2, 3]), "image/png");

    const result = await uploadAssetIfNeeded(
      "qwen",
      { url: `/api/generated-images/${imageId}` },
      "dashscope-key"
    );

    expect(result).toBe("data:image/png;base64,AQID");
  });

  it("keeps source URL for providers without upload requirement", async () => {
    await import("./registry");
    const { uploadAssetIfNeeded } = await import("./upload");

    const result = await uploadAssetIfNeeded(
      "seedream",
      { url: "https://example.com/source.png" },
      "ark-key"
    );

    expect(result).toBe("https://example.com/source.png");
  });
});
