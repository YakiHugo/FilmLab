const TIFF_LITTLE_ENDIAN = true;
const TIFF_HEADER_SIZE = 8;

const writeUint16 = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value, TIFF_LITTLE_ENDIAN);
};

const writeUint32 = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value, TIFF_LITTLE_ENDIAN);
};

const writeIfdEntry = (
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  valueOrOffset: number
) => {
  writeUint16(view, offset, tag);
  writeUint16(view, offset + 2, type);
  writeUint32(view, offset + 4, count);
  writeUint32(view, offset + 8, valueOrOffset);
};

const TYPE_SHORT = 3;
const TYPE_LONG = 4;

/**
 * Encode RGBA pixel data into a baseline uncompressed TIFF blob.
 * Compatible with common desktop apps and browsers that can decode TIFF.
 */
export const encodeRgbaToTiff = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Blob => {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const expectedLength = safeWidth * safeHeight * 4;

  if (pixels.length < expectedLength) {
    throw new Error("Insufficient RGBA data for TIFF encoding.");
  }

  const entryCount = 11;
  const ifdSize = 2 + entryCount * 12 + 4;
  const pixelDataOffset = TIFF_HEADER_SIZE;
  const pixelDataLength = expectedLength;
  const ifdOffset = pixelDataOffset + pixelDataLength;
  const bitsPerSampleOffset = ifdOffset + ifdSize;
  const bitsPerSampleByteLength = 8; // 4 * uint16
  const totalSize = bitsPerSampleOffset + bitsPerSampleByteLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // TIFF header: II (little-endian), magic 42, first IFD offset.
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  writeUint16(view, 2, 42);
  writeUint32(view, 4, ifdOffset);

  // Pixel payload starts at offset 8.
  bytes.set(pixels.subarray(0, expectedLength), pixelDataOffset);

  // IFD.
  writeUint16(view, ifdOffset, entryCount);
  let entryOffset = ifdOffset + 2;

  // ImageWidth.
  writeIfdEntry(view, entryOffset, 256, TYPE_LONG, 1, safeWidth);
  entryOffset += 12;
  // ImageLength.
  writeIfdEntry(view, entryOffset, 257, TYPE_LONG, 1, safeHeight);
  entryOffset += 12;
  // BitsPerSample: [8,8,8,8].
  writeIfdEntry(view, entryOffset, 258, TYPE_SHORT, 4, bitsPerSampleOffset);
  entryOffset += 12;
  // Compression = 1 (none).
  writeIfdEntry(view, entryOffset, 259, TYPE_SHORT, 1, 1);
  entryOffset += 12;
  // PhotometricInterpretation = 2 (RGB).
  writeIfdEntry(view, entryOffset, 262, TYPE_SHORT, 1, 2);
  entryOffset += 12;
  // StripOffsets.
  writeIfdEntry(view, entryOffset, 273, TYPE_LONG, 1, pixelDataOffset);
  entryOffset += 12;
  // SamplesPerPixel = 4 (RGBA).
  writeIfdEntry(view, entryOffset, 277, TYPE_SHORT, 1, 4);
  entryOffset += 12;
  // RowsPerStrip = image height.
  writeIfdEntry(view, entryOffset, 278, TYPE_LONG, 1, safeHeight);
  entryOffset += 12;
  // StripByteCounts.
  writeIfdEntry(view, entryOffset, 279, TYPE_LONG, 1, pixelDataLength);
  entryOffset += 12;
  // PlanarConfiguration = 1 (chunky).
  writeIfdEntry(view, entryOffset, 284, TYPE_SHORT, 1, 1);
  entryOffset += 12;
  // ExtraSamples = 2 (unassociated alpha).
  writeIfdEntry(view, entryOffset, 338, TYPE_SHORT, 1, 2);

  // Next IFD offset = 0.
  writeUint32(view, ifdOffset + 2 + entryCount * 12, 0);

  // BitsPerSample values.
  writeUint16(view, bitsPerSampleOffset, 8);
  writeUint16(view, bitsPerSampleOffset + 2, 8);
  writeUint16(view, bitsPerSampleOffset + 4, 8);
  writeUint16(view, bitsPerSampleOffset + 6, 8);

  return new Blob([buffer], { type: "image/tiff" });
};

