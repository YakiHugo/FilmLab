import { describe, expect, it } from "vitest";
import type { AssetMetadata } from "@/types";
import {
  formatCameraLabel,
  formatExposureSummary,
  formatDimensions,
  formatCaptureTime,
} from "./assetMetadata";

describe("formatCameraLabel", () => {
  it("returns fallback when metadata is undefined", () => {
    expect(formatCameraLabel(undefined)).toBe("未知机身");
  });

  it("returns fallback when both make and model are missing", () => {
    expect(formatCameraLabel({} as AssetMetadata)).toBe("未知机身");
  });

  it("joins make and model", () => {
    expect(
      formatCameraLabel({ cameraMake: "Sony", cameraModel: "A7III" } as AssetMetadata)
    ).toBe("Sony A7III");
  });

  it("returns model only when make is missing", () => {
    expect(formatCameraLabel({ cameraModel: "X-T5" } as AssetMetadata)).toBe("X-T5");
  });
});

describe("formatExposureSummary", () => {
  it("returns fallback when metadata is undefined", () => {
    expect(formatExposureSummary(undefined)).toBe("暂无 EXIF");
  });

  it("returns fallback when all fields are missing", () => {
    expect(formatExposureSummary({} as AssetMetadata)).toBe("暂无 EXIF");
  });

  it("formats full exposure info", () => {
    const meta = {
      shutterSpeed: "1/250s",
      aperture: 2.8,
      iso: 400,
      focalLength: 35,
    } as AssetMetadata;
    expect(formatExposureSummary(meta)).toBe("1/250s · f/2.8 · ISO 400 · 35mm");
  });

  it("handles partial data", () => {
    const meta = { aperture: 1.4, iso: 100 } as AssetMetadata;
    expect(formatExposureSummary(meta)).toBe("f/1.4 · ISO 100");
  });
});

describe("formatDimensions", () => {
  it("returns fallback when metadata is undefined", () => {
    expect(formatDimensions(undefined)).toBe("未知尺寸");
  });

  it("returns fallback when dimensions are missing", () => {
    expect(formatDimensions({} as AssetMetadata)).toBe("未知尺寸");
  });

  it("formats width × height", () => {
    expect(formatDimensions({ width: 6000, height: 4000 } as AssetMetadata)).toBe("6000×4000");
  });
});

describe("formatCaptureTime", () => {
  it("returns fallback when metadata is undefined", () => {
    expect(formatCaptureTime(undefined)).toBe("未知时间");
  });

  it("returns fallback when capturedAt is missing", () => {
    expect(formatCaptureTime({} as AssetMetadata)).toBe("未知时间");
  });

  it("returns fallback for invalid date string", () => {
    expect(formatCaptureTime({ capturedAt: "not-a-date" } as AssetMetadata)).toBe("未知时间");
  });

  it("formats a valid ISO date", () => {
    const result = formatCaptureTime({ capturedAt: "2024-05-16T09:32:00Z" } as AssetMetadata);
    // Intl output varies by locale/timezone, just check it's not the fallback
    expect(result).not.toBe("未知时间");
    expect(result).toContain("2024");
  });
});
