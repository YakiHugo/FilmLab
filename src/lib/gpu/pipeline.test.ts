import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PipelineExecutor } from "./pipeline";
import { TexturePool } from "./resources";
import type { GPUPass, GPURenderPassDescriptor, GPUComputePassDescriptor } from "./passes/types";

beforeAll(() => {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const makeMockDevice = () => {
  const renderEncoders: Array<{
    setPipeline: ReturnType<typeof vi.fn>;
    setBindGroup: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }> = [];
  const computeEncoders: Array<{
    setPipeline: ReturnType<typeof vi.fn>;
    setBindGroup: ReturnType<typeof vi.fn>;
    dispatchWorkgroups: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }> = [];

  const beginRenderPass = vi.fn(() => {
    const enc = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
      end: vi.fn(),
    };
    renderEncoders.push(enc);
    return enc as unknown as GPURenderPassEncoder;
  });
  const beginComputePass = vi.fn(() => {
    const enc = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    };
    computeEncoders.push(enc);
    return enc as unknown as GPUComputePassEncoder;
  });
  const finish = vi.fn(() => ({ __commandBuffer: true } as unknown as GPUCommandBuffer));
  const createCommandEncoder = vi.fn(() => ({
    beginRenderPass,
    beginComputePass,
    finish,
  }) as unknown as GPUCommandEncoder);

  let textureCounter = 0;
  const createTexture = vi.fn(() => {
    textureCounter += 1;
    const id = textureCounter;
    return {
      __id: id,
      destroy: vi.fn(),
      createView: vi.fn(() => ({ __viewOf: id })),
    } as unknown as GPUTexture;
  });
  const submit = vi.fn();
  const createBindGroup = vi.fn(() => ({ __bindGroup: true }) as unknown as GPUBindGroup);

  const device = {
    createCommandEncoder,
    createTexture,
    createBindGroup,
    queue: { submit },
  } as unknown as GPUDevice;

  return {
    device,
    createCommandEncoder,
    beginRenderPass,
    beginComputePass,
    finish,
    submit,
    renderEncoders,
    computeEncoders,
  };
};

const fakeRenderPass = (
  id: string,
  overrides: Partial<GPURenderPassDescriptor> = {}
): GPURenderPassDescriptor => ({
  kind: "render",
  id,
  pipeline: { __pipeline: id } as unknown as GPURenderPipeline,
  bindGroups: (ctx) => [
    ctx.device.createBindGroup({
      layout: {} as GPUBindGroupLayout,
      entries: [{ binding: 0, resource: ctx.priorInputView }],
    }),
  ],
  outputFormat: "rgba8unorm",
  enabled: true,
  ...overrides,
});

const makeExecutor = (deviceMock: ReturnType<typeof makeMockDevice>) => {
  const pool = new TexturePool(deviceMock.device);
  return new PipelineExecutor({
    device: deviceMock.device,
    texturePool: pool,
    defaultSampler: {} as GPUSampler,
  });
};

const fakeInput = () => ({
  texture: { __sourceTexture: true } as unknown as GPUTexture,
  view: { __sourceView: true } as unknown as GPUTextureView,
  width: 64,
  height: 64,
  format: "rgba8unorm" as GPUTextureFormat,
});

describe("PipelineExecutor", () => {
  it("returns kind:skipped and does not submit when no passes are enabled", () => {
    const mock = makeMockDevice();
    const executor = makeExecutor(mock);
    const result = executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [{ ...fakeRenderPass("disabled"), enabled: false }],
      input: fakeInput(),
    });

    expect(result.kind).toBe("skipped");
    expect(mock.beginRenderPass).not.toHaveBeenCalled();
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("encodes a single render pass into one command buffer", () => {
    const mock = makeMockDevice();
    const executor = makeExecutor(mock);
    const result = executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [fakeRenderPass("p0")],
      input: fakeInput(),
    });

    expect(mock.beginRenderPass).toHaveBeenCalledTimes(1);
    expect(mock.renderEncoders).toHaveLength(1);
    const enc = mock.renderEncoders[0]!;
    expect(enc.setPipeline).toHaveBeenCalledTimes(1);
    expect(enc.draw).toHaveBeenCalledWith(4);
    expect(enc.end).toHaveBeenCalledTimes(1);
    expect(mock.submit).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("texture");
    if (result.kind === "texture") {
      expect(result.output).toBeDefined();
    }
  });

  it("interleaves compute and render passes in encoding order", () => {
    const mock = makeMockDevice();
    const executor = makeExecutor(mock);
    const compute: GPUComputePassDescriptor = {
      kind: "compute",
      id: "c0",
      pipeline: { __compute: true } as unknown as GPUComputePipeline,
      bindGroup: { __computeBg: true } as unknown as GPUBindGroup,
      workgroupCount: [2, 3, 1],
      enabled: true,
    };

    executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [fakeRenderPass("r0"), compute, fakeRenderPass("r1")] as readonly GPUPass[],
      input: fakeInput(),
    });

    expect(mock.beginRenderPass).toHaveBeenCalledTimes(2);
    expect(mock.beginComputePass).toHaveBeenCalledTimes(1);
    expect(mock.computeEncoders[0]!.dispatchWorkgroups).toHaveBeenCalledWith(2, 3, 1);
  });

  it("renders the last pass to canvas when canvasOutput is provided", () => {
    const mock = makeMockDevice();
    const canvasTexture = {
      __canvasTex: true,
      createView: vi.fn(() => ({ __canvasView: true })),
    } as unknown as GPUTexture;
    const getCurrentTexture = vi.fn(() => canvasTexture);
    const canvasContext = { getCurrentTexture } as unknown as GPUCanvasContext;

    const executor = makeExecutor(mock);
    const result = executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [fakeRenderPass("p0")],
      input: fakeInput(),
      canvasOutput: { context: canvasContext, width: 64, height: 64, format: "rgba8unorm" },
    });

    expect(getCurrentTexture).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("canvas");
  });

  it("throws when canvasOutput is set but the last enabled pass is compute", () => {
    const mock = makeMockDevice();
    const executor = makeExecutor(mock);
    const compute: GPUComputePassDescriptor = {
      kind: "compute",
      id: "c-last",
      pipeline: { __compute: true } as unknown as GPUComputePipeline,
      bindGroup: { __computeBg: true } as unknown as GPUBindGroup,
      workgroupCount: [1, 1, 1],
      enabled: true,
    };
    const canvasContext = {
      getCurrentTexture: vi.fn(),
    } as unknown as GPUCanvasContext;

    expect(() =>
      executor.execute({
        baseWidth: 64,
        baseHeight: 64,
        passes: [fakeRenderPass("r0"), compute] as readonly GPUPass[],
        input: fakeInput(),
        canvasOutput: { context: canvasContext, width: 64, height: 64, format: "rgba8unorm" },
      })
    ).toThrow(/last enabled pass to be a render pass/);
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("feeds each render pass's output as the next pass's priorInputView", () => {
    const mock = makeMockDevice();
    const executor = makeExecutor(mock);
    const seenPriorViews: GPUTextureView[] = [];
    const recordingPass = (id: string) =>
      fakeRenderPass(id, {
        bindGroups: (ctx) => {
          seenPriorViews.push(ctx.priorInputView);
          return [
            ctx.device.createBindGroup({
              layout: {} as GPUBindGroupLayout,
              entries: [{ binding: 0, resource: ctx.priorInputView }],
            }),
          ];
        },
      });

    const input = fakeInput();
    executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [recordingPass("p0"), recordingPass("p1"), recordingPass("p2")],
      input,
    });

    expect(seenPriorViews).toHaveLength(3);
    expect(seenPriorViews[0]).toBe(input.view);
    // p1 sees p0's output, p2 sees p1's output — and they are distinct.
    expect(seenPriorViews[1]).not.toBe(input.view);
    expect(seenPriorViews[2]).not.toBe(seenPriorViews[1]);
  });

  it("never re-leases a pool texture acquired earlier in the same execute call", () => {
    // The release-after-submit invariant: leases used as inputs in earlier
    // passes must not be returned to the pool until queue.submit, otherwise
    // the pool could hand the same texture back as the next pass's output
    // (read+write feedback loop in a single submission).
    const mock = makeMockDevice();
    const pool = new TexturePool(mock.device);
    const acquiredTextures: GPUTexture[] = [];
    const realAcquire = pool.acquire.bind(pool);
    pool.acquire = ((...args: Parameters<typeof realAcquire>) => {
      const handle = realAcquire(...args);
      acquiredTextures.push(handle.texture);
      return handle;
    }) as typeof pool.acquire;

    const executor = new PipelineExecutor({
      device: mock.device,
      texturePool: pool,
      defaultSampler: {} as GPUSampler,
    });
    executor.execute({
      baseWidth: 64,
      baseHeight: 64,
      passes: [fakeRenderPass("p0"), fakeRenderPass("p1"), fakeRenderPass("p2")],
      input: fakeInput(),
    });

    expect(acquiredTextures).toHaveLength(3);
    expect(new Set(acquiredTextures).size).toBe(3);
  });
});
