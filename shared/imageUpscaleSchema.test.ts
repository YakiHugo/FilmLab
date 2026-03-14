import { describe, expect, it } from "vitest";
import { imageUpscaleRequestSchema } from "./imageUpscaleSchema";

describe("imageUpscaleRequestSchema", () => {
  it("accepts canonical runtime providers when the model resolves to the same platform", () => {
    const result = imageUpscaleRequestSchema.safeParse({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      imageId: "generated-1",
      scale: "2x",
    });

    expect(result.success).toBe(true);
  });

  it("rejects provider/model combinations that resolve to different families", () => {
    const result = imageUpscaleRequestSchema.safeParse({
      provider: "ark",
      model: "qwen-image-2.0-pro",
      imageId: "generated-1",
      scale: "2x",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("model");
  });
});
