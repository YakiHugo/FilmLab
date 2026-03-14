import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, EditorLayer } from "@/types";
import { describe, expect, it } from "vitest";
import type { PreviewRequest } from "./contracts";
import {
  MAX_RETAINED_PREVIEW_DOCUMENTS,
  pruneRetainedPreviewDocuments,
  resolveLayerPreviewAdjustments,
  resolveLayerPreviewFilmProfile,
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
  return {
    document: {
      documentKey: "editor:asset-a",
      sourceAssetId: sourceAsset.id,
      adjustments: baseAdjustments,
      layers: [] as EditorLayer[],
      filmProfile: { id: "document-film" } as Asset["filmProfile"],
      showOriginal: false,
    },
    documentKey: "editor:asset-a",
    quality: "full",
    frameSize: {
      width: 800,
      height: 600,
    },
    viewportRoi: null,
    layerEntries: [],
    showOriginal: false,
    timestampText: null,
    isCropMode: false,
    orientedSourceAspectRatio: 4 / 3,
    previewRenderSeed: 1,
    sourceAsset,
    shouldRenderLayerComposite: true,
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
