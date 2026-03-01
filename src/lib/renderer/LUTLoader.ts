import * as twgl from "twgl.js";
import { parseCubeLUT } from "./CubeLUTParser";

/**
 * HaldCLUT PNG -> WebGL 3D Texture loader.
 *
 * HaldCLUT is a 2D PNG that encodes a 3D color lookup table:
 * - Level 8 = 8^3 = 512 entries, image size 512x512 (64 color blocks, 8x8 layout)
 * - Level 16 = 16^3 = 4096 entries, image size 4096x4096
 *
 * Each pixel position encodes an (R, G, B) input and the pixel color is the mapped output.
 */

export type LUTTextureFormat = "RGBA8" | "RGBA16F";

const floatLinearSupportCache = new WeakMap<WebGL2RenderingContext, boolean>();

const supportsFloatLinearFiltering = (gl: WebGL2RenderingContext): boolean => {
  const cached = floatLinearSupportCache.get(gl);
  if (cached !== undefined) {
    return cached;
  }
  const supported = !!gl.getExtension("OES_texture_float_linear");
  floatLinearSupportCache.set(gl, supported);
  return supported;
};

/**
 * Load an image from a URL or Blob source.
 */
function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load LUT image: ${typeof src === "string" ? src : "Blob"}`));

    if (src instanceof Blob) {
      const url = URL.createObjectURL(src);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load LUT image from Blob"));
      };
      img.src = url;
    } else {
      img.src = src;
    }
  });
}

async function loadText(src: string | Blob): Promise<string> {
  if (src instanceof Blob) {
    return src.text();
  }
  const response = await fetch(src, {
    credentials: "omit",
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Failed to load LUT text: ${src}`);
  }
  return response.text();
}

/**
 * Parse a HaldCLUT PNG into raw 3D texture data (Uint8Array).
 *
 * The HaldCLUT pixel layout maps a linear pixel index to (R, G, B) coordinates:
 *   pixelIndex = b * size^2 + g * size + r
 * where size = level^2 (e.g., 64 for level 8).
 *
 * We read the 2D image data and remap it into a flat 3D array ordered as
 * [R][G][B] with R varying fastest, suitable for `gl.texImage3D`.
 */
function parseHaldCLUT(imageData: ImageData, level: number): Uint8Array {
  const size = level * level; // 64 for level 8, 256 for level 16
  const data = new Uint8Array(size * size * size * 4);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        // HaldCLUT coordinate mapping
        const pixelIndex = b * size * size + g * size + r;
        const px = pixelIndex % imageData.width;
        const py = Math.floor(pixelIndex / imageData.width);
        const srcIdx = (py * imageData.width + px) * 4;
        const dstIdx = (b * size * size + g * size + r) * 4;

        data[dstIdx + 0] = imageData.data[srcIdx + 0];
        data[dstIdx + 1] = imageData.data[srcIdx + 1];
        data[dstIdx + 2] = imageData.data[srcIdx + 2];
        data[dstIdx + 3] = 255;
      }
    }
  }

  return data;
}

/**
 * Upload parsed 3D LUT data as a WebGL 3D texture.
 */
const toFloatData = (data: Uint8Array | Float32Array): Float32Array => {
  if (data instanceof Float32Array) {
    return data;
  }
  const floatData = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    floatData[i] = data[i]! / 255;
  }
  return floatData;
};

const toByteData = (data: Uint8Array | Float32Array): Uint8Array => {
  if (data instanceof Uint8Array) {
    return data;
  }
  const byteData = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    byteData[i] = Math.round(Math.min(1, Math.max(0, data[i]!)) * 255);
  }
  return byteData;
};

function upload3DTexture(
  gl: WebGL2RenderingContext,
  data: Uint8Array | Float32Array,
  size: number,
  format: LUTTextureFormat
): WebGLTexture {
  if (format === "RGBA16F") {
    const floatData = toFloatData(data);
    return twgl.createTexture(gl, {
      target: gl.TEXTURE_3D,
      src: floatData,
      width: size,
      height: size,
      depth: size,
      internalFormat: gl.RGBA16F,
      format: gl.RGBA,
      type: gl.FLOAT,
      min: gl.LINEAR,
      mag: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      wrapR: gl.CLAMP_TO_EDGE,
      auto: false,
    });
  }

  return twgl.createTexture(gl, {
    target: gl.TEXTURE_3D,
    src: toByteData(data),
    width: size,
    height: size,
    depth: size,
    internalFormat: gl.RGBA8,
    format: gl.RGBA,
    type: gl.UNSIGNED_BYTE,
    min: gl.LINEAR,
    mag: gl.LINEAR,
    wrapS: gl.CLAMP_TO_EDGE,
    wrapT: gl.CLAMP_TO_EDGE,
    wrapR: gl.CLAMP_TO_EDGE,
    auto: false,
  });
}

/**
 * Load a .cube LUT file and upload it as a WebGL 3D texture.
 */
export async function loadCubeLUT(
  gl: WebGL2RenderingContext,
  source: string | Blob,
  textureFormat: LUTTextureFormat = "RGBA8"
): Promise<WebGLTexture> {
  const text = await loadText(source);
  const parsed = parseCubeLUT(text);
  if (textureFormat === "RGBA16F") {
    if (!supportsFloatLinearFiltering(gl)) {
      return upload3DTexture(gl, parsed.data, parsed.size, "RGBA8");
    }
    try {
      return upload3DTexture(gl, parsed.data, parsed.size, "RGBA16F");
    } catch {
      return upload3DTexture(gl, parsed.data, parsed.size, "RGBA8");
    }
  }
  return upload3DTexture(gl, parsed.data, parsed.size, "RGBA8");
}

/**
 * Validate a HaldCLUT image dimensions match the expected level.
 */
function validateHaldCLUT(image: HTMLImageElement, level: number): void {
  const size = level * level;
  const expectedPixels = size * size * size;
  const expectedWidth = size * level; // e.g., 64 * 8 = 512

  if (image.width !== expectedWidth || image.height !== expectedWidth) {
    throw new Error(
      `Invalid HaldCLUT dimensions: expected ${expectedWidth}x${expectedWidth}, ` +
        `got ${image.width}x${image.height} for level ${level}`
    );
  }

  const actualPixels = image.width * image.height;
  if (actualPixels < expectedPixels) {
    throw new Error(
      `HaldCLUT has insufficient pixels: need ${expectedPixels}, got ${actualPixels}`
    );
  }
}

/**
 * Read pixel data from an image, releasing the temporary canvas ASAP.
 *
 * For level-16 HaldCLUT (4096x4096) the canvas alone holds ~67MB.
 * We zero-size it immediately after `getImageData` so the browser can
 * reclaim that memory before we allocate the 3D texture buffer.
 */
function readPixels(image: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Failed to create 2D context for HaldCLUT parsing");
  }
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Release canvas backing store immediately
  canvas.width = 0;
  canvas.height = 0;
  return imageData;
}

/**
 * Load a HaldCLUT PNG and create a WebGL 3D Texture.
 *
 * @param gl - WebGL2 rendering context
 * @param imageSrc - URL string or Blob of the HaldCLUT PNG
 * @param level - LUT level (8 = 8^3 = 512px image, 16 = 16^3 = 4096px image)
 * @returns The created WebGL 3D texture
 */
export async function loadHaldCLUT(
  gl: WebGL2RenderingContext,
  imageSrc: string | Blob,
  level: 8 | 16 = 8,
  textureFormat: LUTTextureFormat = "RGBA8"
): Promise<WebGLTexture> {
  // 1. Load image
  const image = await loadImage(imageSrc);

  // 2. Validate dimensions
  validateHaldCLUT(image, level);

  // 3. Read pixels and release the canvas immediately
  const imageData = readPixels(image);

  // 4. Remap 2D pixels into 3D texture data, then drop imageData reference
  const size = level * level;
  const data = parseHaldCLUT(imageData, level);
  // imageData is now unreferenced and eligible for GC

  // 5. Upload as WebGL 3D Texture. Prefer higher precision when requested,
  // but always fall back to RGBA8 for compatibility.
  if (textureFormat === "RGBA16F") {
    if (!supportsFloatLinearFiltering(gl)) {
      return upload3DTexture(gl, data, size, "RGBA8");
    }
    try {
      return upload3DTexture(gl, data, size, "RGBA16F");
    } catch {
      return upload3DTexture(gl, data, size, "RGBA8");
    }
  }

  return upload3DTexture(gl, data, size, "RGBA8");
}

/**
 * Generic 3D LUT loader.
 * - `.cube` -> parse text LUT
 * - fallback -> parse HaldCLUT PNG
 */
export async function load3DLUT(
  gl: WebGL2RenderingContext,
  source: string | Blob,
  level: 8 | 16 = 8,
  textureFormat: LUTTextureFormat = "RGBA8"
): Promise<WebGLTexture> {
  const isCubeByPath =
    typeof source === "string" ? /\.cube(?:$|\?)/i.test(source) : false;
  const isCubeByMime =
    source instanceof Blob ? /text|cube|json/i.test(source.type) : false;
  if (isCubeByPath || isCubeByMime) {
    return loadCubeLUT(gl, source, textureFormat);
  }
  return loadHaldCLUT(gl, source, level, textureFormat);
}
