import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, CanvasDocument, CanvasImageElement } from "@/types";

const createCanvasImageRenderContextMock = vi.fn();
const renderCanvasImageElementToCanvasMock = vi.fn();

const assetStoreState: { assets: Asset[] } = {
  assets: [],
};

const canvasStoreState: { documents: CanvasDocument[]; zoom: number } = {
  documents: [],
  zoom: 1,
};

vi.mock("@/features/canvas/boardImageRendering", () => ({
  createCanvasImageRenderContext: (...args: unknown[]) => createCanvasImageRenderContextMock(...args),
  renderCanvasImageElementToCanvas: (...args: unknown[]) =>
    renderCanvasImageElementToCanvasMock(...args),
}));

vi.mock("./assetStore", () => ({
  useAssetStore: {
    getState: () => assetStoreState,
  },
}));

vi.mock("./canvasStore", () => ({
  useCanvasStore: {
    getState: () => canvasStoreState,
  },
}));

import { useCanvasRuntimeStore } from "./canvasRuntimeStore";

const createCanvasMock = () =>
  ({
    height: 0,
    width: 0,
  }) as HTMLCanvasElement;

const createAsset = (): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 2048,
  createdAt: "2026-03-17T00:00:00.000Z",
  objectUrl: "blob:asset-1",
  thumbnailUrl: "blob:asset-1-thumb",
  adjustments: createDefaultAdjustments(),
  layers: [],
  tags: [],
  importDay: "2026-03-17",
  group: "2026-03-17",
  origin: "file",
  remote: {
    status: "local_only",
    updatedAt: "2026-03-17T00:00:00.000Z",
  },
  ownerRef: {
    userId: "user-1",
  },
});

const createImageElement = (): CanvasImageElement => ({
  id: "image-1",
  type: "image",
  assetId: "asset-1",
  x: 24,
  y: 32,
  width: 320,
  height: 180,
  rotation: 0,
  opacity: 1,
  locked: false,
  visible: true,
  zIndex: 1,
  adjustments: createDefaultAdjustments(),
});

const createDocument = (element: CanvasImageElement): CanvasDocument => ({
  id: "doc-1",
  name: "Board",
  width: 1200,
  height: 800,
  presetId: "custom",
  backgroundColor: "#000000",
  elements: [element],
  slices: [],
  guides: {
    showCenter: false,
    showThirds: false,
    showSafeArea: false,
  },
  safeArea: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
});

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("canvasRuntimeStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      createElement: vi.fn((tagName: string) => {
        if (tagName !== "canvas") {
          throw new Error(`Unsupported element requested in test: ${tagName}`);
        }
        return createCanvasMock();
      }),
    });
    assetStoreState.assets = [createAsset()];
    canvasStoreState.documents = [createDocument(createImageElement())];
    canvasStoreState.zoom = 1;
    createCanvasImageRenderContextMock.mockReset();
    renderCanvasImageElementToCanvasMock.mockReset();
    createCanvasImageRenderContextMock.mockImplementation(
      ({
        element,
        priority,
        viewportScale,
      }: {
        element: CanvasImageElement;
        priority: "background" | "interactive";
        viewportScale?: number;
      }) => ({
        cacheKey: `${priority}:${element.id}:${viewportScale ?? 1}`,
      })
    );
    renderCanvasImageElementToCanvasMock.mockImplementation(
      async ({
        canvas,
        element,
        priority,
      }: {
        canvas: HTMLCanvasElement;
        element: CanvasImageElement;
        priority: "background" | "interactive";
      }) => {
        canvas.width = priority === "interactive" ? 480 : 720;
        canvas.height = priority === "interactive" ? 320 : 480;
        return {
          cacheKey: `${priority}:${element.id}:${canvasStoreState.zoom}`,
        };
      }
    );
    useCanvasRuntimeStore.setState({
      draftAdjustmentsByElementId: {},
      previewEntries: {},
      selectionPreviewElementIds: null,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps background previews evictable after render completes", async () => {
    await useCanvasRuntimeStore.getState().requestBoardPreview("image-1", "background");
    await flushAsyncWork();

    const entry = useCanvasRuntimeStore.getState().previewEntries["image-1"];
    expect(entry?.renderStatus).toBe("ready");
    expect(entry?.retained).toBe(false);
    expect(entry?.previewSource?.width).toBe(720);
  });

  it("renders an interactive preview first and upgrades it after the interaction settles", async () => {
    await useCanvasRuntimeStore.getState().requestBoardPreview("image-1", "interactive");
    await flushAsyncWork();

    const interactiveEntry = useCanvasRuntimeStore.getState().previewEntries["image-1"];
    expect(interactiveEntry?.renderStatus).toBe("ready");
    expect(interactiveEntry?.retained).toBe(true);
    expect(interactiveEntry?.previewSource?.width).toBe(480);

    await vi.advanceTimersByTimeAsync(160);
    await flushAsyncWork();

    const settledEntry = useCanvasRuntimeStore.getState().previewEntries["image-1"];
    expect(settledEntry?.renderStatus).toBe("ready");
    expect(settledEntry?.retained).toBe(false);
    expect(settledEntry?.previewSource?.width).toBe(720);
  });

  it("prunes the oldest evictable previews back to the cache budget", () => {
    const previewEntries = Object.fromEntries(
      Array.from({ length: 26 }, (_, index) => {
        const canvas = createCanvasMock();
        canvas.width = 100 + index;
        canvas.height = 60 + index;
        return [
          `image-${index}`,
          {
            errorMessage: null,
            lastRequestedAt: index + 1,
            previewCacheKey: `cache-${index}`,
            previewSource: canvas,
            previewVersion: index,
            renderStatus: "ready" as const,
            retained: false,
          },
        ];
      })
    );

    useCanvasRuntimeStore.setState({
      draftAdjustmentsByElementId: {},
      previewEntries,
      selectionPreviewElementIds: null,
    });

    useCanvasRuntimeStore.getState().releaseBoardPreview("image-25");

    const nextEntries = useCanvasRuntimeStore.getState().previewEntries;
    expect(Object.keys(nextEntries)).toHaveLength(24);
    expect(nextEntries["image-0"]).toBeUndefined();
    expect(nextEntries["image-1"]).toBeUndefined();
    expect(nextEntries["image-2"]).toBeDefined();
    expect((previewEntries["image-0"]?.previewSource as HTMLCanvasElement).width).toBe(0);
    expect((previewEntries["image-1"]?.previewSource as HTMLCanvasElement).height).toBe(0);
  });

  it("short-circuits preview selection updates when ids are unchanged", () => {
    useCanvasRuntimeStore.getState().setSelectionPreviewElementIds(["image-1"]);
    const firstPreviewSelectionIds = useCanvasRuntimeStore.getState().selectionPreviewElementIds;

    useCanvasRuntimeStore.getState().setSelectionPreviewElementIds(["image-1"]);

    expect(useCanvasRuntimeStore.getState().selectionPreviewElementIds).toBe(
      firstPreviewSelectionIds
    );

    useCanvasRuntimeStore.getState().clearSelectionPreview();
    expect(useCanvasRuntimeStore.getState().selectionPreviewElementIds).toBeNull();
  });
});
