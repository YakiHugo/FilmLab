/** 1×1×1 passthrough LUT used when a 3D-texture slot is disabled. */
export function createPlaceholderLut3D(device: GPUDevice): GPUTexture {
  const tex = device.createTexture({
    label: "film.placeholder3d",
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: "3d",
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([0, 0, 0, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );
  return tex;
}
