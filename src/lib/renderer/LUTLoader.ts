/**
 * HaldCLUT PNG -> WebGL 3D Texture loader.
 *
 * HaldCLUT is a 2D PNG that encodes a 3D color lookup table:
 * - Level 8 = 8^3 = 512 entries, image size 512x512 (64 color blocks, 8x8 layout)
 * - Level 16 = 16^3 = 4096 entries, image size 4096x4096
 *
 * Each pixel position encodes an (R, G, B) input and the pixel color is the mapped output.
 */

/**
 * Load an image from a URL or Blob source.
 */
function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load LUT image: ${typeof src === "string" ? src : "Blob"}`));

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
function parseHaldCLUT(
  imageData: ImageData,
  level: number
): Uint8Array {
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
function upload3DTexture(
  gl: WebGL2RenderingContext,
  data: Uint8Array,
  size: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create WebGL 3D texture for LUT");
  }

  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA8,
    size,
    size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  return texture;
}

/**
 * Validate a HaldCLUT image dimensions match the expected level.
 */
function validateHaldCLUT(
  image: HTMLImageElement,
  level: number
): void {
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
  level: 8 | 16 = 8
): Promise<WebGLTexture> {
  // 1. Load image
  const image = await loadImage(imageSrc);

  // 2. Validate dimensions
  validateHaldCLUT(image, level);

  // 3. Read pixels via Canvas 2D
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create 2D context for HaldCLUT parsing");
  }
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 4. Remap 2D pixels into 3D texture data
  const size = level * level;
  const data = parseHaldCLUT(imageData, level);

  // 5. Upload as WebGL 3D Texture
  return upload3DTexture(gl, data, size);
}
