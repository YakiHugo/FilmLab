import { describe, expect, it } from "vitest";
import { copyJpegExif } from "./jpegExif";

const createJpegWithExif = () => {
  const bytes = new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10, // APP0 len 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    0x00,
    0x48,
    0x00,
    0x48,
    0x00,
    0x00,
    0xff,
    0xe1,
    0x00,
    0x10, // APP1 len 16
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0xff,
    0xda,
    0x00,
    0x08, // SOS len 8
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x11,
    0x22,
    0x33,
    0xff,
    0xd9, // EOI
  ]);
  return new Blob([bytes], { type: "image/jpeg" });
};

const createJpegWithoutExif = () => {
  const bytes = new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10, // APP0 len 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    0x00,
    0x48,
    0x00,
    0x48,
    0x00,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0xaa,
    0xbb,
    0xcc,
    0xff,
    0xd9,
  ]);
  return new Blob([bytes], { type: "image/jpeg" });
};

describe("copyJpegExif", () => {
  it("injects EXIF APP1 from source JPEG into rendered JPEG", async () => {
    const source = createJpegWithExif();
    const rendered = createJpegWithoutExif();
    const merged = await copyJpegExif(source, rendered);
    const bytes = new Uint8Array(await merged.arrayBuffer());

    const payload = Array.from(bytes);
    const app1Index = payload.findIndex(
      (value, index) => value === 0xff && payload[index + 1] === 0xe1
    );
    expect(app1Index).toBeGreaterThan(0);
    expect(payload[app1Index + 4]).toBe(0x45); // E
    expect(payload[app1Index + 5]).toBe(0x78); // x
    expect(payload[app1Index + 6]).toBe(0x69); // i
    expect(payload[app1Index + 7]).toBe(0x66); // f
  });
});

