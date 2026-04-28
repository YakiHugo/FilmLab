import { describe, expect, it, vi } from "vitest";

import { ShaderCache } from "./shaders";

const makeMockDevice = () => {
  const createShaderModule = vi.fn((descriptor: GPUShaderModuleDescriptor) => ({
    label: descriptor.label ?? null,
    code: descriptor.code,
  }));
  return {
    device: { createShaderModule } as unknown as GPUDevice,
    createShaderModule,
  };
};

describe("ShaderCache", () => {
  it("dedupes identical sources to a single compiled module", () => {
    const { device, createShaderModule } = makeMockDevice();
    const cache = new ShaderCache(device);
    const src = "@vertex fn main() {}";

    const first = cache.compile(src);
    const second = cache.compile(src);

    expect(first).toBe(second);
    expect(createShaderModule).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });

  it("compiles distinct sources into distinct modules", () => {
    const { device, createShaderModule } = makeMockDevice();
    const cache = new ShaderCache(device);

    cache.compile("@vertex fn a() {}");
    cache.compile("@vertex fn b() {}");

    expect(createShaderModule).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(2);
  });

  it("clear() drops cached entries", () => {
    const { device } = makeMockDevice();
    const cache = new ShaderCache(device);
    cache.compile("source-a");
    cache.compile("source-b");
    expect(cache.size()).toBe(2);

    cache.clear();

    expect(cache.size()).toBe(0);
  });
});
