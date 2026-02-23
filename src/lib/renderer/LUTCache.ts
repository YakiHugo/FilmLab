import { loadHaldCLUT } from "./LUTLoader";

/** How long a failed LUT load is remembered before retrying (ms). */
const NEGATIVE_CACHE_TTL_MS = 30_000;

/**
 * LRU cache for WebGL 3D textures loaded from HaldCLUT images.
 *
 * Manages up to `maxSize` cached textures. When the cache is full,
 * the least-recently-used texture is evicted and its GPU resource freed.
 *
 * Failed loads are negatively cached for {@link NEGATIVE_CACHE_TTL_MS}
 * to avoid hammering the same broken URL on every render frame.
 *
 * Uses Map insertion order for O(1) LRU operations (delete + re-insert
 * moves an entry to the end; the first key is always the oldest).
 */
export class LUTCache {
  private cache = new Map<string, WebGLTexture>();
  /** Timestamps of failed loads — entries older than TTL are retried. */
  private failures = new Map<string, number>();
  private maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  /**
   * Get a 3D LUT texture for the given path, loading it if not cached.
   * Moves the entry to the most-recently-used position.
   *
   * Throws if the load fails. The failure is negatively cached so
   * subsequent calls within the TTL window reject immediately.
   */
  async get(gl: WebGL2RenderingContext, lutPath: string, level: 8 | 16 = 8): Promise<WebGLTexture> {
    // Check positive cache
    const existing = this.cache.get(lutPath);
    if (existing) {
      this.cache.delete(lutPath);
      this.cache.set(lutPath, existing);
      return existing;
    }

    // Check negative cache — reject fast if recently failed
    const failedAt = this.failures.get(lutPath);
    if (failedAt !== undefined) {
      if (Date.now() - failedAt < NEGATIVE_CACHE_TTL_MS) {
        throw new Error(`LUT load for "${lutPath}" recently failed, skipping retry`);
      }
      this.failures.delete(lutPath);
    }

    // Load new LUT
    let texture: WebGLTexture;
    try {
      texture = await loadHaldCLUT(gl, lutPath, level);
    } catch (err) {
      this.failures.set(lutPath, Date.now());
      throw err;
    }

    this.cache.set(lutPath, texture);

    // LRU eviction — first key in Map is the oldest entry
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value!;
      const tex = this.cache.get(oldestKey);
      if (tex) {
        gl.deleteTexture(tex);
      }
      this.cache.delete(oldestKey);
    }

    return texture;
  }

  /**
   * Check if a LUT is already cached (positive cache only).
   */
  has(lutPath: string): boolean {
    return this.cache.has(lutPath);
  }

  /**
   * Release all cached GPU textures and clear failure records.
   */
  dispose(gl: WebGL2RenderingContext): void {
    for (const tex of this.cache.values()) {
      gl.deleteTexture(tex);
    }
    this.cache.clear();
    this.failures.clear();
  }
}
