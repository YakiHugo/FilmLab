import { describe, expect, it } from "vitest";
import { resolveAsciiForegroundBlendMode } from "./asciiGpuPresentation";

describe("asciiGpuPresentation", () => {
  it("maps supported canvas blend modes onto renderer blend modes", () => {
    expect(resolveAsciiForegroundBlendMode("source-over")).toBe("normal");
    expect(resolveAsciiForegroundBlendMode("multiply")).toBe("multiply");
    expect(resolveAsciiForegroundBlendMode("screen")).toBe("screen");
    expect(resolveAsciiForegroundBlendMode("overlay")).toBe("overlay");
    expect(resolveAsciiForegroundBlendMode("soft-light")).toBe("softLight");
  });

  it("rejects unsupported canvas blend modes so callers can fall back to CPU", () => {
    expect(resolveAsciiForegroundBlendMode("difference")).toBeNull();
    expect(resolveAsciiForegroundBlendMode("hard-light")).toBeNull();
  });
});
