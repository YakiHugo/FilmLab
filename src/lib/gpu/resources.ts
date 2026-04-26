/**
 * Texture pool, image upload, and readback for the WebGPU pipeline.
 *
 * Pool semantics mirror the WebGL2 `TexturePool`: keyed by width × height ×
 * format, LRU eviction by free-entry count and bytes. Releases must happen
 * AFTER `device.queue.submit` — encoded passes still hold the texture as an
 * attachment until the queue actually executes.
 */

// Lazy because `GPUTextureUsage` is a runtime browser global that does not
// exist in the node test environment; evaluating at module load would crash
// the test before any GPU code runs.
const defaultPoolUsage = (): GPUTextureUsageFlags =>
  GPUTextureUsage.RENDER_ATTACHMENT |
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST;

const bytesPerPixel = (format: GPUTextureFormat): number => {
  switch (format) {
    case "r8unorm":
    case "r8snorm":
    case "r8uint":
    case "r8sint":
      return 1;
    case "rg8unorm":
    case "rg8snorm":
    case "rg8uint":
    case "rg8sint":
    case "r16uint":
    case "r16sint":
    case "r16float":
      return 2;
    case "rgba8unorm":
    case "rgba8unorm-srgb":
    case "rgba8snorm":
    case "rgba8uint":
    case "rgba8sint":
    case "bgra8unorm":
    case "bgra8unorm-srgb":
    case "rgb10a2unorm":
    case "rg11b10ufloat":
    case "r32float":
    case "r32uint":
    case "r32sint":
    case "rg16uint":
    case "rg16sint":
    case "rg16float":
      return 4;
    case "rgba16uint":
    case "rgba16sint":
    case "rgba16float":
    case "rg32float":
    case "rg32uint":
    case "rg32sint":
      return 8;
    case "rgba32float":
    case "rgba32uint":
    case "rgba32sint":
      return 16;
    default:
      // Conservative fallback for compressed/depth formats.
      return 4;
  }
};

const poolKey = (width: number, height: number, format: GPUTextureFormat): string =>
  `${width}x${height}:${format}`;

export interface PooledTexture {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;
  /** Returns the lease to the pool. Idempotent. */
  release: () => void;
}

interface PoolEntry {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  format: GPUTextureFormat;
  inUse: boolean;
  lastUsedAt: number;
  byteSize: number;
}

export interface TexturePoolOptions {
  /** Soft cap on free entries before LRU eviction. */
  maxFreeEntries?: number;
  /** Soft cap on free bytes before LRU eviction. */
  maxFreeBytes?: number;
  /** Default usage flags applied when callers don't specify. */
  defaultUsage?: GPUTextureUsageFlags;
}

export class TexturePool {
  private readonly device: GPUDevice;
  private readonly entries = new Set<PoolEntry>();
  private readonly textureToEntry = new Map<GPUTexture, PoolEntry>();
  private readonly maxFreeEntries: number;
  private readonly maxFreeBytes: number;
  private readonly defaultUsageOverride?: GPUTextureUsageFlags;
  private disposed = false;

  constructor(device: GPUDevice, options: TexturePoolOptions = {}) {
    this.device = device;
    this.maxFreeEntries = options.maxFreeEntries ?? 12;
    this.maxFreeBytes = options.maxFreeBytes ?? 256 * 1024 * 1024;
    this.defaultUsageOverride = options.defaultUsage;
  }

  acquire(
    width: number,
    height: number,
    format: GPUTextureFormat,
    usage?: GPUTextureUsageFlags
  ): PooledTexture {
    const resolvedUsage = usage ?? this.defaultUsageOverride ?? defaultPoolUsage();
    if (this.disposed) {
      throw new Error("TexturePool: cannot acquire after dispose().");
    }
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = poolKey(w, h, format);
    const now = performance.now();

    for (const entry of this.entries) {
      if (entry.inUse) continue;
      if (poolKey(entry.width, entry.height, entry.format) !== key) continue;
      entry.inUse = true;
      entry.lastUsedAt = now;
      return this.makeHandle(entry);
    }

    const texture = this.device.createTexture({
      label: `pool:${key}`,
      size: { width: w, height: h },
      format,
      usage: resolvedUsage,
    });
    const view = texture.createView({ label: `pool:${key}:view` });
    const entry: PoolEntry = {
      texture,
      view,
      width: w,
      height: h,
      format,
      inUse: true,
      lastUsedAt: now,
      byteSize: w * h * bytesPerPixel(format),
    };
    this.entries.add(entry);
    this.textureToEntry.set(texture, entry);
    this.pruneFreeEntries();
    return this.makeHandle(entry);
  }

  /** Diagnostic snapshot — number of in-use vs free entries. */
  stats(): { total: number; inUse: number; free: number; freeBytes: number } {
    let inUse = 0;
    let free = 0;
    let freeBytes = 0;
    for (const entry of this.entries) {
      if (entry.inUse) {
        inUse += 1;
      } else {
        free += 1;
        freeBytes += entry.byteSize;
      }
    }
    return { total: inUse + free, inUse, free, freeBytes };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries) {
      entry.texture.destroy();
    }
    this.entries.clear();
    this.textureToEntry.clear();
  }

  private makeHandle(entry: PoolEntry): PooledTexture {
    let released = false;
    return {
      texture: entry.texture,
      view: entry.view,
      width: entry.width,
      height: entry.height,
      format: entry.format,
      release: () => {
        if (released) return;
        released = true;
        if (!entry.inUse) return;
        entry.inUse = false;
        entry.lastUsedAt = performance.now();
        this.pruneFreeEntries();
      },
    };
  }

  private pruneFreeEntries(): void {
    const free: PoolEntry[] = [];
    for (const entry of this.entries) {
      if (!entry.inUse) free.push(entry);
    }
    if (free.length === 0) return;
    free.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    let count = free.length;
    let bytes = free.reduce((sum, e) => sum + e.byteSize, 0);
    for (const victim of free) {
      const trimByCount = count > this.maxFreeEntries;
      const trimByBytes = bytes > this.maxFreeBytes;
      if (!trimByCount && !trimByBytes) break;
      victim.texture.destroy();
      this.entries.delete(victim);
      this.textureToEntry.delete(victim.texture);
      count -= 1;
      bytes -= victim.byteSize;
    }
  }
}

export type ExternalImageSource =
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas
  | HTMLImageElement
  | HTMLVideoElement;

export interface UploadImageOptions {
  /** Defaults to `rgba8unorm`. */
  format?: GPUTextureFormat;
  /** Defaults to COPY_DST | RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC. */
  usage?: GPUTextureUsageFlags;
  /** Forwarded to copyExternalImageToTexture; defaults to false. */
  flipY?: boolean;
  /** Forwarded to copyExternalImageToTexture; defaults to false. */
  premultipliedAlpha?: boolean;
  label?: string;
}

const sourceWidth = (source: ExternalImageSource): number => {
  if ("videoWidth" in source && typeof source.videoWidth === "number" && source.videoWidth > 0) {
    return source.videoWidth;
  }
  if ("naturalWidth" in source && typeof source.naturalWidth === "number" && source.naturalWidth > 0) {
    return source.naturalWidth;
  }
  return source.width;
};

const sourceHeight = (source: ExternalImageSource): number => {
  if ("videoHeight" in source && typeof source.videoHeight === "number" && source.videoHeight > 0) {
    return source.videoHeight;
  }
  if ("naturalHeight" in source && typeof source.naturalHeight === "number" && source.naturalHeight > 0) {
    return source.naturalHeight;
  }
  return source.height;
};

export function uploadExternalImageToTexture(
  device: GPUDevice,
  source: ExternalImageSource,
  options: UploadImageOptions = {}
): { texture: GPUTexture; width: number; height: number; format: GPUTextureFormat } {
  const width = sourceWidth(source);
  const height = sourceHeight(source);
  if (width <= 0 || height <= 0) {
    throw new Error(`uploadExternalImageToTexture: invalid source size ${width}x${height}.`);
  }
  const format = options.format ?? "rgba8unorm";
  const usage =
    options.usage ??
    GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT;
  const texture = device.createTexture({
    label: options.label ?? "uploadExternalImageToTexture",
    size: { width, height },
    format,
    usage,
  });
  device.queue.copyExternalImageToTexture(
    { source, flipY: options.flipY ?? false },
    { texture, premultipliedAlpha: options.premultipliedAlpha ?? false },
    { width, height }
  );
  return { texture, width, height, format };
}

/**
 * Read back an `rgba8unorm` (or compatible 4-bytes-per-pixel) texture as a
 * tight-packed `Uint8Array`. Texture must be created with `COPY_SRC` usage.
 *
 * `bytesPerRow` in `copyTextureToBuffer` must be a multiple of 256, so we
 * allocate a padded buffer then strip padding into the returned array.
 */
export async function readbackTextureRGBA8(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number
): Promise<Uint8Array> {
  const minBytesPerRow = width * 4;
  const bytesPerRow = Math.ceil(minBytesPerRow / 256) * 256;
  const buffer = device.createBuffer({
    label: "readbackTextureRGBA8",
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder({ label: "readbackTextureRGBA8" });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow, rowsPerImage: height },
    { width, height }
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(buffer.getMappedRange()).slice();
  buffer.unmap();
  buffer.destroy();
  if (bytesPerRow === minBytesPerRow) {
    return padded;
  }
  const out = new Uint8Array(minBytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    const src = y * bytesPerRow;
    const dst = y * minBytesPerRow;
    out.set(padded.subarray(src, src + minBytesPerRow), dst);
  }
  return out;
}
