import { describe, expect, it } from "vitest";
import { encodeRgbaToTiff } from "./tiff";

describe("encodeRgbaToTiff", () => {
  it("encodes RGBA buffer into TIFF blob", async () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, // red
      0, 255, 0, 255, // green
    ]);
    const blob = encodeRgbaToTiff(pixels, 2, 1);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe("image/tiff");
    expect(bytes[0]).toBe(0x49);
    expect(bytes[1]).toBe(0x49);
    expect(bytes[2]).toBe(42);
    expect(bytes[3]).toBe(0);
    // Pixel data starts at offset 8.
    expect(bytes[8]).toBe(255);
    expect(bytes[9]).toBe(0);
    expect(bytes[10]).toBe(0);
    expect(bytes[11]).toBe(255);
  });
});

