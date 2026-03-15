import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { describe, expect, it } from "vitest";
import { buildRenderGraph } from "../renderGraph";
import type { PreviewRequest } from "./contracts";
import {
  MAX_RETAINED_PREVIEW_DOCUMENTS,
  pruneRetainedPreviewDocuments,
  resolveLayerPreviewAdjustments,
  resolveLayerPreviewFilmProfile,
  resolvePreviewSourceCacheKey,
} from "./usePreviewRenderPipeline";

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

describe("usePreviewRenderPipeline helpers", () => {
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
});
