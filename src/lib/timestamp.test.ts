import { describe, expect, it } from "vitest";
import { resolveAssetTimestampText } from "./timestamp";

describe("resolveAssetTimestampText", () => {
  it("prefers EXIF capture time", () => {
    const result = resolveAssetTimestampText(
      { capturedAt: "2024-05-16T09:32:00" },
      "2026-01-01T00:00:00"
    );
    expect(result).toBe("2024.05.16 09:32");
  });

  it("falls back to asset createdAt when EXIF is missing", () => {
    const result = resolveAssetTimestampText(undefined, "2026-02-14T20:05:00");
    expect(result).toBe("2026.02.14 20:05");
  });

  it("returns null when both timestamps are invalid", () => {
    const result = resolveAssetTimestampText({ capturedAt: "invalid" }, "bad");
    expect(result).toBeNull();
  });
});
