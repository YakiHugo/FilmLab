import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRenderGraph } from "../renderGraph";
import type { PreviewRequest } from "./contracts";
import {
  MAX_RETAINED_PREVIEW_DOCUMENTS,
  createPreviewCanvasBucket,
  executePreviewRenderRequest,
  pruneRetainedPreviewDocuments,
  resolveLayerPreviewAdjustments,
  resolveLayerPreviewFilmProfile,
  resolvePreviewSourceCacheKey,
} from "./usePreviewRenderPipeline";

const renderImageToCanvasMock = vi.fn();
const composeRenderGraphToCanvasMock = vi.fn();

vi.mock("@/lib/imageProcessing", () => ({
  releaseRenderSlots: vi.fn(),
  renderImageToCanvas: (...args: unknown[]) => renderImageToCanvasMock(...args),
}));

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: vi.fn(),
}));

vi.mock("../renderGraphComposition", async () => {
  const actual =
    await vi.importActual<typeof import("../renderGraphComposition")>("../renderGraphComposition");
  return {
    ...actual,
    composeRenderGraphToCanvas: (...args: unknown[]) => composeRenderGraphToCanvasMock(...args),
  };
});

const createAsset = (id: string, filmProfile?: Asset["filmProfile"]) =>
  ({
    id,
    name: `${id}.jpg`,
    type: "image/jpeg",
    size: 1024,
    createdAt: "2026-03-14T00:00:00.000Z",
    objectUrl: `blob:${id}`,
    filmProfile,
  }) as Asset;

const createRequest = (overrides?: Partial<PreviewRequest>): PreviewRequest => {
  const baseAdjustments = createDefaultAdjustments();
  const sourceAsset = createAsset("asset-a", { id: "source-film" } as Asset["filmProfile"]);
  const renderGraph = buildRenderGraph({
    documentKey: "editor:asset-a",
    sourceAsset,
    filmProfile: { id: "document-film" } as Asset["filmProfile"],
    layerEntries: [],
    showOriginal: false,
  });
  return {
    document: {
      documentKey: "editor:asset-a",
      key: "editor:asset-a",
      sourceAsset,
      sourceAssetId: sourceAsset.id,
      layerStack: [],
      adjustments: baseAdjustments,
      filmProfile: { id: "document-film" } as Asset["filmProfile"],
      renderGraph,
      dirtyKeys: {
        source: "source",
        "layer-stack": "",
        "layer-adjustments": "",
        "layer-mask": "",
        "document-adjustments": "document",
        "film-profile": "film",
        "local-adjustments": "",
        roi: "",
      },
      dirtyReasons: ["source", "document-adjustments", "film-profile"],
      layerEntries: [],
      showOriginal: false,
    },
    documentKey: "editor:asset-a",
    graphKey: renderGraph.key,
    quality: "full",
    frameSize: {
      width: 800,
      height: 600,
    },
    viewportRoi: null,
    renderGraph,
    showOriginal: false,
    timestampText: null,
    isCropMode: false,
    orientedSourceAspectRatio: 4 / 3,
    previewRenderSeed: 1,
    sourceAsset,
    shouldRenderLayerComposite: true,
    dirtyReasons: ["source", "document-adjustments", "film-profile"],
    ...overrides,
  };
};

const createMultiLayerRequest = () => {
  const sourceAsset = createAsset("asset-a", { id: "source-film" } as Asset["filmProfile"]);
  const baseAdjustments = createDefaultAdjustments();
  const layerEntries = [
    {
      layer: {
        id: "top",
        name: "Top",
        type: "adjustment" as const,
        visible: true,
        opacity: 75,
        blendMode: "screen" as const,
        adjustments: createDefaultAdjustments(),
      },
      sourceAsset,
      adjustments: createDefaultAdjustments(),
      opacity: 0.75,
      blendMode: "screen" as const,
    },
    {
      layer: {
        id: "base",
        name: "Base",
        type: "base" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        adjustments: createDefaultAdjustments(),
      },
      sourceAsset,
      adjustments: createDefaultAdjustments(),
      opacity: 1,
      blendMode: "normal" as const,
    },
  ];
  const renderGraph = buildRenderGraph({
    documentKey: "editor:asset-a",
    sourceAsset,
    filmProfile: { id: "document-film" } as Asset["filmProfile"],
    layerEntries,
    showOriginal: false,
  });

  return createRequest({
    document: {
      documentKey: "editor:asset-a",
      key: "editor:asset-a",
      sourceAsset,
      sourceAssetId: sourceAsset.id,
      layerStack: layerEntries.map((entry) => entry.layer),
      adjustments: baseAdjustments,
      filmProfile: { id: "document-film" } as Asset["filmProfile"],
      renderGraph,
      dirtyKeys: {
        source: "source",
        "layer-stack": "stack",
        "layer-adjustments": "layer-adjustments",
        "layer-mask": "",
        "document-adjustments": "document",
        "film-profile": "film",
        "local-adjustments": "",
        roi: "",
      },
      dirtyReasons: ["source", "layer-stack", "document-adjustments", "film-profile"],
      layerEntries: [],
      showOriginal: false,
    },
    graphKey: renderGraph.key,
    renderGraph,
  });
};

describe("usePreviewRenderPipeline helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      })),
    });
    renderImageToCanvasMock.mockResolvedValue(undefined);
    composeRenderGraphToCanvasMock.mockResolvedValue(true);
  });

  it("uses default adjustments for layered original previews", () => {
    const request = createRequest({ showOriginal: true });
    const adjustments = createDefaultAdjustments();
    adjustments.exposure = 42;

    expect(resolveLayerPreviewAdjustments(request, adjustments)).toEqual(
      createDefaultAdjustments()
    );
  });

  it("drops film profiles when layered original mode is active", () => {
    const request = createRequest({ showOriginal: true });
    expect(resolveLayerPreviewFilmProfile(request, request.sourceAsset)).toBeUndefined();
  });

  it("uses the document film profile for the source asset and asset profile for external layers", () => {
    const request = createRequest();
    const externalLayerAsset = createAsset("texture-a", {
      id: "texture-film",
    } as Asset["filmProfile"]);

    expect(resolveLayerPreviewFilmProfile(request, request.sourceAsset)).toBe(
      request.document.filmProfile
    );
    expect(resolveLayerPreviewFilmProfile(request, externalLayerAsset)).toBe(
      externalLayerAsset.filmProfile
    );
  });

  it("keeps preview source cache keys stable across render graph revisions", () => {
    const sourceAsset = createAsset("asset-a");

    expect(resolvePreviewSourceCacheKey(sourceAsset, "layer:base")).toBe(
      resolvePreviewSourceCacheKey(
        {
          ...sourceAsset,
          objectUrl: sourceAsset.objectUrl,
        },
        "layer:base"
      )
    );
  });

  it("changes the preview source cache key when the source asset changes", () => {
    const sourceAsset = createAsset("asset-a");
    const updatedAsset = {
      ...sourceAsset,
      objectUrl: "blob:asset-a-v2",
    };

    expect(resolvePreviewSourceCacheKey(updatedAsset, "layer:base")).not.toBe(
      resolvePreviewSourceCacheKey(sourceAsset, "layer:base")
    );
  });

  it("evicts the oldest retained preview documents once the cache exceeds its bound", () => {
    const retained = new Map<string, number>([
      ["doc-a", 1],
      ["doc-b", 2],
      ["doc-c", 3],
    ]);
    const evicted: Array<[string, number]> = [];

    pruneRetainedPreviewDocuments(
      retained,
      MAX_RETAINED_PREVIEW_DOCUMENTS,
      (documentKey, value) => {
        evicted.push([documentKey, value]);
      }
    );

    expect(evicted).toEqual([["doc-a", 1]]);
    expect(Array.from(retained.keys())).toEqual(["doc-b", "doc-c"]);
  });

  it("routes multi-layer preview requests through the shared composite backend seam", async () => {
    const bucket = createPreviewCanvasBucket();
    const request = createMultiLayerRequest();

    await executePreviewRenderRequest({
      bucket,
      request,
      signal: new AbortController().signal,
      requestId: 7,
    });

    expect(composeRenderGraphToCanvasMock).toHaveBeenCalledTimes(1);
    expect(composeRenderGraphToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      targetCanvas: bucket.outputCanvas,
      renderGraph: request.renderGraph,
      backend: {
        id: "canvas2d",
      },
      targetSize: request.frameSize,
    });
    expect(renderImageToCanvasMock).not.toHaveBeenCalled();
  });

  it("keeps single-layer preview requests on the direct fast path when no composite is needed", async () => {
    const bucket = createPreviewCanvasBucket();
    const request = createRequest({
      renderGraph: buildRenderGraph({
        documentKey: "editor:asset-a",
        sourceAsset: createAsset("asset-a"),
        filmProfile: undefined,
        layerEntries: [
          {
            layer: {
              id: "base",
              name: "Base",
              type: "base" as const,
              visible: true,
              opacity: 100,
              blendMode: "normal" as const,
              adjustments: createDefaultAdjustments(),
            },
            sourceAsset: createAsset("asset-a"),
            adjustments: createDefaultAdjustments(),
            opacity: 1,
            blendMode: "normal" as const,
          },
        ],
        showOriginal: false,
      }),
    });

    await executePreviewRenderRequest({
      bucket,
      request,
      signal: new AbortController().signal,
      requestId: 11,
    });

    expect(composeRenderGraphToCanvasMock).not.toHaveBeenCalled();
    expect(renderImageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderImageToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas: bucket.outputCanvas,
      renderSlot: expect.stringContaining(":single"),
      sourceCacheKey: expect.stringContaining("preview:source:layer:"),
    });
  });
});
