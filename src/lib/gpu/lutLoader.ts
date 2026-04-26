/**
 * WebGPU texture loaders.
 *
 * loadLut3DTexture: HaldCLUT PNGs (level 8 = 64³, level 16 = 256³) and .cube text files.
 * load2DTexture: plain RGBA PNG/JPEG for noise, damage, and border assets.
 *
 * All loaded textures are cached per-device (WeakMap keyed on GPUDevice, so device
 * loss automatically invalidates the cache). Concurrent calls with the same key
 * await the same in-flight upload instead of creating duplicate textures.
 * Callers must NOT destroy the returned textures — they are owned by the cache.
 */

import { parseCubeLUT } from "@/lib/renderer/CubeLUTParser";

const _deviceLutCache = new WeakMap<GPUDevice, Map<string, Promise<GPUTexture>>>();

function getLutCache(device: GPUDevice): Map<string, Promise<GPUTexture>> {
  let cache = _deviceLutCache.get(device);
  if (!cache) {
    cache = new Map();
    _deviceLutCache.set(device, cache);
  }
  return cache;
}

async function loadText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "force-cache", credentials: "omit" });
  if (!res.ok) throw new Error(`LUT fetch failed: ${url} (${res.status})`);
  return res.text();
}

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { cache: "force-cache", credentials: "omit" });
  if (!res.ok) throw new Error(`LUT image fetch failed: ${url} (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function parseHaldCLUT(bitmap: ImageBitmap, level: number): Uint8Array {
  const size = level * level;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2D context for HaldCLUT parsing");
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const pixels = imgData.data;
  const out = new Uint8Array(size * size * size * 4);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const pixIdx = b * size * size + g * size + r;
        const px = pixIdx % bitmap.width;
        const py = Math.floor(pixIdx / bitmap.width);
        const srcBase = (py * bitmap.width + px) * 4;
        const dstBase = (b * size * size + g * size + r) * 4;
        out[dstBase + 0] = pixels[srcBase + 0]!;
        out[dstBase + 1] = pixels[srcBase + 1]!;
        out[dstBase + 2] = pixels[srcBase + 2]!;
        out[dstBase + 3] = 255;
      }
    }
  }
  return out;
}

function upload3D(device: GPUDevice, data: Uint8Array, size: number, label: string): GPUTexture {
  const tex = device.createTexture({
    label,
    size: { width: size, height: size, depthOrArrayLayers: size },
    dimension: "3d",
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    data.buffer as ArrayBuffer,
    { bytesPerRow: size * 4, rowsPerImage: size },
    { width: size, height: size, depthOrArrayLayers: size },
  );
  return tex;
}

function floatToUint8(data: Float32Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.round(Math.min(1, Math.max(0, data[i]!)) * 255);
  }
  return out;
}

export async function loadLut3DTexture(
  device: GPUDevice,
  url: string,
  level: 8 | 16 = 8,
): Promise<GPUTexture> {
  const cache = getLutCache(device);
  const key = `${url}|${level}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const loading = (async () => {
    const isCube = /\.cube(?:$|\?)/i.test(url);
    if (isCube) {
      const text = await loadText(url);
      const parsed = parseCubeLUT(text);
      return upload3D(device, floatToUint8(parsed.data), parsed.size, `lut3d:${url}`);
    } else {
      const bitmap = await loadImageBitmap(url);
      const size = level * level;
      const data = parseHaldCLUT(bitmap, level);
      bitmap.close();
      return upload3D(device, data, size, `lut3d:${url}`);
    }
  })();
  cache.set(key, loading);
  loading.catch(() => cache.delete(key));
  return loading;
}

export async function load2DTexture(
  device: GPUDevice,
  url: string,
): Promise<GPUTexture> {
  const cache = getLutCache(device);
  const key = `2d:${url}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const loading = (async () => {
    const bitmap = await loadImageBitmap(url);
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Failed to get 2d context for ${url}`);
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    bitmap.close();
    const tex = device.createTexture({
      label: `tex2d:${url}`,
      size: { width, height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      imgData.data.buffer as ArrayBuffer,
      { bytesPerRow: width * 4 },
      { width, height },
    );
    return tex;
  })();
  cache.set(key, loading);
  loading.catch(() => cache.delete(key));
  return loading;
}
