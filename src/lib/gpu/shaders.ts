/**
 * WGSL module compilation cache.
 *
 * Keyed by the full source string — `Map<string, ...>` already hashes
 * internally and compares by value, so distinct sources never collide and
 * we don't carry a custom FNV hash that would silently return the wrong
 * module on a (rare but real) 32-bit collision. Replaces the WebGL2
 * `ProgramRegistry`. Compilation is lazy (on first use) rather than eager;
 * later slices may add a warmup if cold-start latency matters.
 */

export class ShaderCache {
  private readonly device: GPUDevice;
  private readonly modules = new Map<string, GPUShaderModule>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Returns a cached or freshly compiled `GPUShaderModule` for the given
   * WGSL source. The same source string always returns the same module.
   */
  compile(source: string, label?: string): GPUShaderModule {
    const cached = this.modules.get(source);
    if (cached) return cached;
    const module = this.device.createShaderModule({ code: source, label });
    this.modules.set(source, module);
    return module;
  }

  /** Test seam — number of distinct sources cached. */
  size(): number {
    return this.modules.size;
  }

  clear(): void {
    this.modules.clear();
  }
}
