/**
 * WGSL module compilation cache.
 *
 * Keyed by FNV-1a hash of source. Replaces the WebGL2 `ProgramRegistry` —
 * note this cache is lazy (compile on first use) rather than eager (compile
 * everything at init). Lazy fits Slice 0 where only the passthrough shader
 * exists; later slices may add an eager warmup if cold-start latency matters.
 */

const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

interface CacheEntry {
  module: GPUShaderModule;
  source: string;
}

export class ShaderCache {
  private readonly device: GPUDevice;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Returns a cached or freshly compiled `GPUShaderModule` for the given
   * WGSL source. The same source string always returns the same module.
   */
  compile(source: string, label?: string): GPUShaderModule {
    const key = fnv1a32(source);
    const cached = this.entries.get(key);
    if (cached) return cached.module;
    const module = this.device.createShaderModule({ code: source, label });
    this.entries.set(key, { module, source });
    return module;
  }

  /** Test seam — number of distinct sources cached. */
  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
