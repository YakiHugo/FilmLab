/**
 * Per-device lazy cache. Each adapter that owns its own pipeline caches uses
 * one of these to keep `ShaderCache` + per-format pipeline caches alive across
 * calls without leaking when the `GPUDevice` itself is collected.
 */

export const createPerDeviceCache = <T>(factory: (device: GPUDevice) => T) => {
  const map = new WeakMap<GPUDevice, T>();
  return (device: GPUDevice): T => {
    let entry = map.get(device);
    if (!entry) {
      entry = factory(device);
      map.set(device, entry);
    }
    return entry;
  };
};
