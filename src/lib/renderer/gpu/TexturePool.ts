import * as twgl from "twgl.js";
import type { FramebufferInfo } from "twgl.js";
import type { PipelineOutputFormat } from "./PipelinePass";

export interface PooledRenderTarget {
  texture: WebGLTexture;
  framebufferInfo: FramebufferInfo;
  width: number;
  height: number;
  format: PipelineOutputFormat;
}

interface PoolEntry {
  target: PooledRenderTarget;
  inUse: boolean;
  lastUsedAt: number;
  byteSize: number;
}

const toKey = (width: number, height: number, format: PipelineOutputFormat) =>
  `${width}x${height}:${format}`;

export class TexturePool {
  private readonly entries = new Set<PoolEntry>();
  private readonly textureToEntry = new Map<WebGLTexture, PoolEntry>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly supportsFloatRenderTarget: boolean,
    private readonly supportsFloatLinearFiltering: boolean,
    private readonly maxFreeEntries = 12,
    private readonly maxFreeBytes = 256 * 1024 * 1024
  ) {}

  resolveFormat(format: PipelineOutputFormat): PipelineOutputFormat {
    if (
      format === "RGBA16F" &&
      (!this.supportsFloatRenderTarget || !this.supportsFloatLinearFiltering)
    ) {
      return "RGBA8";
    }
    return format;
  }

  acquire(width: number, height: number, requestedFormat: PipelineOutputFormat): PooledRenderTarget {
    const format = this.resolveFormat(requestedFormat);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = toKey(w, h, format);
    const now = performance.now();

    for (const entry of this.entries) {
      if (entry.inUse) {
        continue;
      }
      if (toKey(entry.target.width, entry.target.height, entry.target.format) !== key) {
        continue;
      }
      entry.inUse = true;
      entry.lastUsedAt = now;
      return entry.target;
    }

    const created = this.createTarget(w, h, format);
    const entry: PoolEntry = {
      target: created,
      inUse: true,
      lastUsedAt: now,
      byteSize: created.width * created.height * (created.format === "RGBA16F" ? 8 : 4),
    };
    this.entries.add(entry);
    this.textureToEntry.set(created.texture, entry);
    this.pruneFreeEntries();
    return created;
  }

  release(target: PooledRenderTarget | null | undefined): void {
    if (!target) {
      return;
    }
    const entry = this.textureToEntry.get(target.texture);
    if (!entry) {
      return;
    }
    entry.inUse = false;
    entry.lastUsedAt = performance.now();
    this.pruneFreeEntries();
  }

  dispose(): void {
    for (const entry of this.entries) {
      this.disposeEntry(entry);
    }
    this.entries.clear();
    this.textureToEntry.clear();
  }

  private pruneFreeEntries(): void {
    const freeEntries = Array.from(this.entries).filter((entry) => !entry.inUse);
    if (freeEntries.length === 0) {
      return;
    }

    freeEntries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    let freeCount = freeEntries.length;
    let freeBytes = freeEntries.reduce((sum, entry) => sum + entry.byteSize, 0);
    for (const victim of freeEntries) {
      const shouldTrimByCount = freeCount > this.maxFreeEntries;
      const shouldTrimByBytes = freeBytes > this.maxFreeBytes;
      if (!shouldTrimByCount && !shouldTrimByBytes) {
        break;
      }
      this.disposeEntry(victim);
      this.entries.delete(victim);
      this.textureToEntry.delete(victim.target.texture);
      freeCount -= 1;
      freeBytes -= victim.byteSize;
    }
  }

  private createTarget(
    width: number,
    height: number,
    format: PipelineOutputFormat
  ): PooledRenderTarget {
    const internalFormat = format === "RGBA16F" ? this.gl.RGBA16F : this.gl.RGBA8;
    const type = format === "RGBA16F" ? this.gl.HALF_FLOAT : this.gl.UNSIGNED_BYTE;

    const texture = twgl.createTexture(this.gl, {
      target: this.gl.TEXTURE_2D,
      width,
      height,
      internalFormat,
      format: this.gl.RGBA,
      type,
      min: this.gl.LINEAR,
      mag: this.gl.LINEAR,
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      auto: false,
    });

    const framebufferInfo = twgl.createFramebufferInfo(
      this.gl,
      [
        {
          attachment: texture,
          target: this.gl.TEXTURE_2D,
        },
      ],
      width,
      height
    );

    return {
      texture,
      framebufferInfo,
      width,
      height,
      format,
    };
  }

  private disposeEntry(entry: PoolEntry): void {
    this.gl.deleteFramebuffer(entry.target.framebufferInfo.framebuffer);
    this.gl.deleteTexture(entry.target.texture);
  }
}
