const MARKER_PREFIX = 0xff;
const MARKER_SOI = 0xd8;
const MARKER_APP0 = 0xe0;
const MARKER_APP1 = 0xe1;
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;

interface JpegSegment {
  marker: number;
  offset: number;
  length: number; // includes marker + size bytes + payload
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === MARKER_PREFIX && bytes[1] === MARKER_SOI;

const readSegments = (bytes: Uint8Array): JpegSegment[] => {
  if (!isJpeg(bytes)) {
    return [];
  }

  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== MARKER_PREFIX) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === MARKER_SOS || marker === MARKER_EOI) {
      break;
    }
    const size = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (size < 2) {
      break;
    }
    const length = size + 2;
    if (offset + length > bytes.length) {
      break;
    }
    segments.push({ marker, offset, length });
    offset += length;
  }
  return segments;
};

const isExifApp1 = (bytes: Uint8Array, segment: JpegSegment) => {
  if (segment.marker !== MARKER_APP1) {
    return false;
  }
  const payloadOffset = segment.offset + 4;
  return (
    bytes[payloadOffset] === 0x45 &&
    bytes[payloadOffset + 1] === 0x78 &&
    bytes[payloadOffset + 2] === 0x69 &&
    bytes[payloadOffset + 3] === 0x66 &&
    bytes[payloadOffset + 4] === 0x00 &&
    bytes[payloadOffset + 5] === 0x00
  );
};

const readBlobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/**
 * Copy EXIF APP1 metadata blocks from source JPEG into rendered JPEG.
 * If either input is not a valid JPEG, the rendered blob is returned unchanged.
 */
export const copyJpegExif = async (source: Blob, rendered: Blob): Promise<Blob> => {
  const [sourceBytes, renderedBytes] = await Promise.all([readBlobBytes(source), readBlobBytes(rendered)]);
  if (!isJpeg(sourceBytes) || !isJpeg(renderedBytes)) {
    return rendered;
  }

  const sourceSegments = readSegments(sourceBytes);
  const renderedSegments = readSegments(renderedBytes);
  if (sourceSegments.length === 0 || renderedSegments.length === 0) {
    return rendered;
  }

  const exifSegments = sourceSegments
    .filter((segment) => isExifApp1(sourceBytes, segment))
    .map((segment) => sourceBytes.slice(segment.offset, segment.offset + segment.length));

  if (exifSegments.length === 0) {
    return rendered;
  }

  let insertOffset = 2; // after SOI
  const firstSegment = renderedSegments[0];
  if (firstSegment && firstSegment.marker === MARKER_APP0) {
    insertOffset = firstSegment.offset + firstSegment.length;
  }

  const exifTotalLength = exifSegments.reduce((sum, segment) => sum + segment.length, 0);
  const out = new Uint8Array(renderedBytes.length + exifTotalLength);
  out.set(renderedBytes.subarray(0, insertOffset), 0);

  let cursor = insertOffset;
  for (const segment of exifSegments) {
    out.set(segment, cursor);
    cursor += segment.length;
  }

  out.set(renderedBytes.subarray(insertOffset), cursor);
  return new Blob([out], { type: "image/jpeg" });
};

