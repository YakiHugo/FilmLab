import { describe, expect, it } from "vitest";

describe("runtime route selection", () => {
  it("rejects requested targets that do not match any deployment", async () => {
    const { ProviderError } = await import("../../providers/base/errors");
    const { selectRouteTargets } = await import("./selection");

    expect(() =>
      selectRouteTargets({
        modelId: "qwen-image-2-pro",
        operation: "image.generate",
        requestedTarget: {
          provider: "ark",
        },
      })
    ).toThrowError(ProviderError);
  });
});
