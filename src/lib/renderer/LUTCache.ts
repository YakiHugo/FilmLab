import { loadHaldCLUT } from "./LUTLoader";

/**
 * LRU cache for WebGL 3D textures loaded from HaldCLUT images.
 *
 * Manages up to `maxSize` cached textures. When the cache is full,
 * the least-recently-used texture is evicted and its GPU resource freed.
 */
export class LUTCache {
  private cache = new Map<string, WebGLTexture>();
  private order: string[] = [];
  private maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  /**
   * Get a 3D LUT texture for the given path, loading it if not cached.
   * Moves the entry to the most-recently-used position.
   */
  async get(
    gl: WebGL2RenderingContext,
    lutPath: string,
    level: 8 | 16 = 8
  ): Promise<WebGLTexture> {
    if (this.cache.has(lutPath)) {
      // Move to most-recently-used
      this.order = this.order.filter((k) => k !== lutPath);
      this.order.push(lutPath);
      return this.cache.get(lutPath)!;
    }

    // Load new LUT
    const texture = await loadHaldCLUT(gl, lutPath, level);
    this.cache.set(lutPath, texture);
    this.order.push(lutPath);

    // LRU eviction
    while (this.order.length > this.maxSize) {
      const evicted = this.order.shift()!;
      const tex = this.cache.get(evicted);
      if (tex) {
        gl.deleteTexture(tex);
        this.cache.delete(evicted);
      }
    }

    return texture;
  }

  /**
   * Check if a LUT is already cached.
   */
  has(lutPath: string): boolean {
    return this.cache.has(lutPath);
  }

  /**
   * Release all cached GPU textures.
   */
  dispose(gl: WebGL2RenderingContext): void {
    for (const tex of this.cache.values()) {
      gl.deleteTexture(tex);
    }
    this.cache.clear();
    this.order = [];
  }
}
