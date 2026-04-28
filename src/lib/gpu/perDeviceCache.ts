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
