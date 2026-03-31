import { describe, expect, it } from "vitest";
import { buildAsciiAnalysisCacheKey } from "./asciiAnalysis";

describe("asciiAnalysis", () => {
  it("builds a stable cache key for equivalent requests", () => {
    const first = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
    });
    const second = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
    });

    expect(first).toBe(second);
  });

  it("changes the cache key when the snapshot source or quality changes", () => {
    const styleAnalysis = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "full",
    });
    const developAnalysis = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "develop",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "full",
    });
    const interactive = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
    });

    expect(styleAnalysis).not.toBe(developAnalysis);
    expect(styleAnalysis).not.toBe(interactive);
  });

  it("changes the cache key when mask revision changes", () => {
    const base = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 640,
        height: 360,
      },
      quality: "full",
      maskRevisionKey: "mask-a",
    });
    const differentMask = buildAsciiAnalysisCacheKey({
      revisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 640,
        height: 360,
      },
      quality: "full",
      maskRevisionKey: "mask-c",
    });

    expect(base).not.toBe(differentMask);
  });
});
