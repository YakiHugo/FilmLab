import { describe, expect, it } from "vitest";
import { encodeRgbaToTiff, encodeFloat32RgbaToTiff16 } from "./tiff";

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

describe("encodeFloat32RgbaToTiff16", () => {
  it("encodes float RGBA into 16-bit TIFF blob", async () => {
    const pixels = new Float32Array([
      1.0, 0.0, 0.0, 1.0, // red
      0.0, 1.0, 0.0, 1.0, // green
    ]);
    const blob = encodeFloat32RgbaToTiff16(pixels, 2, 1);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(blob.type).toBe("image/tiff");
    // TIFF header: little-endian, magic 42.
    expect(bytes[0]).toBe(0x49);
    expect(bytes[1]).toBe(0x49);
    expect(view.getUint16(2, true)).toBe(42);

    // Pixel data starts at offset 8, uint16 little-endian.
    // Red pixel: R=65535, G=0, B=0, A=65535.
    expect(view.getUint16(8, true)).toBe(65535);
    expect(view.getUint16(10, true)).toBe(0);
    expect(view.getUint16(12, true)).toBe(0);
    expect(view.getUint16(14, true)).toBe(65535);
    // Green pixel: R=0, G=65535, B=0, A=65535.
    expect(view.getUint16(16, true)).toBe(0);
    expect(view.getUint16(18, true)).toBe(65535);
    expect(view.getUint16(20, true)).toBe(0);
    expect(view.getUint16(22, true)).toBe(65535);
  });

  it("clamps out-of-range values", async () => {
    const pixels = new Float32Array([
      1.5, -0.3, 0.5, 1.0,
    ]);
    const blob = encodeFloat32RgbaToTiff16(pixels, 1, 1);
    const view = new DataView((await blob.arrayBuffer()));

    expect(view.getUint16(8, true)).toBe(65535); // 1.5 → clamped to 1.0
    expect(view.getUint16(10, true)).toBe(0);     // -0.3 → clamped to 0.0
    expect(view.getUint16(12, true)).toBe(32768); // 0.5 → ~32768
    expect(view.getUint16(14, true)).toBe(65535); // 1.0
  });

  it("writes BitsPerSample=16 and SampleFormat=1 in IFD", async () => {
    const pixels = new Float32Array([0, 0, 0, 0]);
    const blob = encodeFloat32RgbaToTiff16(pixels, 1, 1);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    // IFD offset is at header bytes 4-7.
    const ifdOffset = view.getUint32(4, true);
    const entryCount = view.getUint16(ifdOffset, true);
    expect(entryCount).toBe(12);

    // Find BitsPerSample entry (tag 258) and SampleFormat entry (tag 339).
    let bitsPerSampleValueOffset = 0;
    let sampleFormatValueOffset = 0;
    for (let i = 0; i < entryCount; i++) {
      const entryStart = ifdOffset + 2 + i * 12;
      const tag = view.getUint16(entryStart, true);
      if (tag === 258) {
        bitsPerSampleValueOffset = view.getUint32(entryStart + 8, true);
      }
      if (tag === 339) {
        sampleFormatValueOffset = view.getUint32(entryStart + 8, true);
      }
    }

    // BitsPerSample should be [16,16,16,16].
    expect(view.getUint16(bitsPerSampleValueOffset, true)).toBe(16);
    expect(view.getUint16(bitsPerSampleValueOffset + 2, true)).toBe(16);
    expect(view.getUint16(bitsPerSampleValueOffset + 4, true)).toBe(16);
    expect(view.getUint16(bitsPerSampleValueOffset + 6, true)).toBe(16);

    // SampleFormat should be [1,1,1,1] (unsigned integer).
    expect(view.getUint16(sampleFormatValueOffset, true)).toBe(1);
    expect(view.getUint16(sampleFormatValueOffset + 2, true)).toBe(1);
    expect(view.getUint16(sampleFormatValueOffset + 4, true)).toBe(1);
    expect(view.getUint16(sampleFormatValueOffset + 6, true)).toBe(1);
  });

  it("throws on insufficient data", () => {
    const pixels = new Float32Array([0, 0]);
    expect(() => encodeFloat32RgbaToTiff16(pixels, 2, 1)).toThrow("Insufficient");
  });
});
