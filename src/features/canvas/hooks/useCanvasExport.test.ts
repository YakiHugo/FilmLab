import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Asset } from "@/types";
import { createCanvasTestDocument, createImageNode } from "../document/testUtils";
import { renderCanvasArtifactDataUrl, useCanvasExport } from "./useCanvasExport";

const renderCanvasWorkbenchToCanvasMock = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({
  assets: [] as Asset[],
  loadedWorkbench: null as ReturnType<typeof createCanvasTestDocument> | null,
}));

vi.mock("@/stores/assetStore", () => ({
  useAssetStore: (selector: (state: { assets: Asset[] }) => unknown) =>
    selector({ assets: storeState.assets }),
}));

vi.mock("@/stores/canvasStore", () => ({
  useCanvasStore: (selector: (state: { loadedWorkbench: unknown }) => unknown) =>
    selector({ loadedWorkbench: storeState.loadedWorkbench }),
}));

vi.mock("../store/canvasStoreSelectors", () => ({
  selectLoadedWorkbench: (state: { loadedWorkbench: unknown }) => state.loadedWorkbench,
}));

vi.mock("../renderCanvasDocument", () => ({
  renderCanvasWorkbenchToCanvas: renderCanvasWorkbenchToCanvasMock,
}));

describe("renderCanvasArtifactDataUrl", () => {
  afterEach(() => {
    storeState.assets = [];
    storeState.loadedWorkbench = null;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares one canonical preview render across encoding changes", async () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 0, y: 0, width: 1080, height: 1350 }),
      },
      rootIds: ["image-1"],
    });
    storeState.assets = [{ id: "asset-1" } as Asset];
    storeState.loadedWorkbench = workbench;

    let finishRender: () => void = () => undefined;
    const renderGate = new Promise<void>((resolve) => {
      finishRender = resolve;
    });
    const canvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn((mimeType: string) => `data:${mimeType};base64,preview`),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    renderCanvasWorkbenchToCanvasMock.mockImplementation(async ({ canvas: target }) => {
      await renderGate;
      target.width = 1080;
      target.height = 1350;
    });

    let api: ReturnType<typeof useCanvasExport> | null = null;
    const Harness = () => {
      api = useCanvasExport();
      return null;
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Harness));
    });

    const pngPromise = api!.renderArtifactPreview({ format: "png", quality: 0.92 });
    const jpegPromise = api!.renderArtifactPreview({ format: "jpeg", quality: 0.74 });
    await vi.waitFor(() => {
      expect(renderCanvasWorkbenchToCanvasMock).toHaveBeenCalledTimes(1);
    });

    finishRender();
    await expect(pngPromise).resolves.toMatchObject({
      dataUrl: "data:image/png;base64,preview",
      pixelWidth: 1080,
      pixelHeight: 1350,
    });
    await expect(jpegPromise).resolves.toMatchObject({
      dataUrl: "data:image/jpeg;base64,preview",
      pixelWidth: 1080,
      pixelHeight: 1350,
    });
    expect(canvas.toDataURL).toHaveBeenNthCalledWith(1, "image/png", 0.92);
    expect(canvas.toDataURL).toHaveBeenNthCalledWith(2, "image/jpeg", 0.74);

    await act(async () => {
      renderer!.unmount();
    });
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("keeps a preview canvas leased until an in-flight encode settles after unmount", async () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 0, y: 0, width: 1080, height: 1350 }),
      },
      rootIds: ["image-1"],
    });
    storeState.assets = [{ id: "asset-1" } as Asset];
    storeState.loadedWorkbench = workbench;

    let finishRender: () => void = () => undefined;
    const renderGate = new Promise<void>((resolve) => {
      finishRender = resolve;
    });
    const canvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => "data:image/png;base64,leased"),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    renderCanvasWorkbenchToCanvasMock.mockImplementation(async ({ canvas: target }) => {
      await renderGate;
      target.width = 1080;
      target.height = 1350;
    });

    let api: ReturnType<typeof useCanvasExport> | null = null;
    const Harness = () => {
      api = useCanvasExport();
      return null;
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Harness));
    });
    const previewPromise = api!.renderArtifactPreview({ format: "png", quality: 0.92 });
    await vi.waitFor(() => {
      expect(renderCanvasWorkbenchToCanvasMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      renderer!.unmount();
    });
    finishRender();
    await expect(previewPromise).resolves.toEqual({
      dataUrl: "data:image/png;base64,leased",
      pixelWidth: 1080,
      pixelHeight: 1350,
    });
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png", 0.92);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("renders the requested physical density through the canonical document renderer", async () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 0, y: 0, width: 1080, height: 1350 }),
      },
      rootIds: ["image-1"],
    });
    const canvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => "data:image/png;base64,artifact"),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    renderCanvasWorkbenchToCanvasMock.mockImplementation(
      async ({ canvas: target, height, pixelRatio, width }) => {
        target.width = width * pixelRatio;
        target.height = height * pixelRatio;
      }
    );

    const result = await renderCanvasArtifactDataUrl({
      assets: [{ id: "asset-1" } as Asset],
      format: "png",
      height: 1350,
      pixelRatio: 2,
      quality: 0.92,
      width: 1080,
      workbench,
    });

    expect(result).toEqual({
      dataUrl: "data:image/png;base64,artifact",
      pixelHeight: 2700,
      pixelWidth: 2160,
    });
    expect(renderCanvasWorkbenchToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assets: [{ id: "asset-1" }],
        document: workbench,
        height: 1350,
        pixelRatio: 2,
        width: 1080,
      })
    );
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png", 0.92);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("rejects before rendering when a visible image asset is missing", async () => {
    const workbench = createCanvasTestDocument({
      nodes: {
        "image-1": createImageNode({ id: "image-1", x: 0, y: 0 }),
      },
      rootIds: ["image-1"],
    });

    await expect(
      renderCanvasArtifactDataUrl({
        assets: [],
        format: "jpeg",
        height: 1350,
        pixelRatio: 1,
        quality: 0.9,
        width: 1080,
        workbench,
      })
    ).rejects.toThrow("缺少图片素材 asset-1");
    expect(renderCanvasWorkbenchToCanvasMock).not.toHaveBeenCalled();
  });
});
