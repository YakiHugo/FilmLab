import { describe, expect, it } from "vitest";
import { resolveRenderIntent } from "./renderIntent";

describe("renderIntent", () => {
  it("maps preview interactive to a preview-quality render config", () => {
    expect(resolveRenderIntent("preview-interactive")).toEqual({
      mode: "preview",
      qualityProfile: "interactive",
      skipHalationBloom: true,
    });
  });

  it("maps export and thumbnail intents to stable full-quality configs", () => {
    expect(resolveRenderIntent("export-full")).toEqual({
      mode: "export",
      qualityProfile: "full",
      skipHalationBloom: false,
    });
    expect(resolveRenderIntent("thumbnail")).toEqual({
      mode: "preview",
      qualityProfile: "full",
      skipHalationBloom: false,
    });
  });
});
