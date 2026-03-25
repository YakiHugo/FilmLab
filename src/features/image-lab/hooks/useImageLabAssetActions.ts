import { useCallback } from "react";
import { importAssetFiles } from "@/lib/assetImport";
import { fetchRemoteAsset } from "@/lib/assetSyncApi";
import { getCanvasResetEpoch, useCanvasStore } from "@/stores/canvasStore";
import { useAssetStore } from "@/stores/assetStore";
import type { CanvasImageElement } from "@/types";
import { createId, resolveCanvasImageInsertionSize } from "@/utils";
import {
  bindResultAssetToConfig,
  bindResultReferenceToConfig,
  clearBoundResultReferencesFromConfig,
  clearReferenceImagesFromConfig,
  removeBoundResultReferenceFromConfig,
  updateAssetRefRoleInConfig,
} from "../referenceImages";
import type { ImageGenerationTurn } from "./imageLabViewState";
import { cloneGenerationConfig } from "./imageLabViewState";
import type { CatalogDrivenFeatureSupport } from "@/lib/ai/imageModelCatalog";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import type { ImageGenerationAssetRefRole, ReferenceImage } from "@/types/imageGeneration";

const resolveAssetRoleNotice = (
  role: ImageGenerationAssetRefRole,
  supportedFeatures: CatalogDrivenFeatureSupport
) => {
  if (role === "reference" && !supportedFeatures.referenceImages.enabled) {
    return "This model will fall back to text-only guidance for image references.";
  }
  if (role === "edit" && !supportedFeatures.referenceImages.enabled) {
    return "This model does not execute direct image edits and will fall back to text guidance.";
  }
  if (role === "variation" && !supportedFeatures.referenceImages.enabled) {
    return "This model does not execute direct image variations and will fall back to text guidance.";
  }
  return null;
};

export function useImageLabAssetActions(input: {
  config: GenerationConfig | null;
  setConfig: (config: GenerationConfig) => void;
  supportedFeatures: CatalogDrivenFeatureSupport;
  setNotice: (message: string | null) => void;
  getUiTurnById: (turnId: string) => ImageGenerationTurn | null;
}) {
  const materializeRemoteAssets = useAssetStore((state) => state.materializeRemoteAssets);

  const materializeGeneratedAssets = useCallback(
    async (assetIds: string[], fallbacks?: Array<{ assetId: string; imageUrl: string; createdAt: string }>) => {
      if (assetIds.length === 0) {
        return;
      }

      if (fallbacks && fallbacks.length > 0) {
        materializeRemoteAssets(
          fallbacks.map((entry, index) => ({
            assetId: entry.assetId,
            name: `Generated image ${index + 1}`,
            type: "image/png",
            size: 0,
            createdAt: entry.createdAt,
            updatedAt: entry.createdAt,
            source: "ai-generated",
            origin: "ai",
            objectUrl: entry.imageUrl,
            thumbnailUrl: entry.imageUrl,
          }))
        );
      }

      const results = await Promise.allSettled(assetIds.map((assetId) => fetchRemoteAsset(assetId)));
      const hydratedAssets = results.flatMap((result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const asset = result.value;
        return [
          {
            assetId: asset.assetId,
            name: asset.name,
            type: asset.type,
            size: asset.size,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
            source: asset.source,
            origin: asset.origin,
            contentHash: asset.contentHash,
            tags: asset.tags,
            metadata: asset.metadata,
            objectUrl: asset.objectUrl,
            thumbnailUrl: asset.thumbnailUrl,
          },
        ];
      });

      if (hydratedAssets.length > 0) {
        materializeRemoteAssets(hydratedAssets);
      }
    },
    [materializeRemoteAssets]
  );

  const addReferenceFiles = useCallback(
    async (files: FileList) => {
      if (!input.config || files.length === 0) {
        return [];
      }

      const imported = await importAssetFiles(files, {
        source: "imported",
        origin: "file",
      });
      const importedAssets = imported.resolvedAssetIds
        .map((assetId) => useAssetStore.getState().assets.find((asset) => asset.id === assetId) ?? null)
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

      if (importedAssets.length === 0) {
        return [];
      }

      const nextConfig = importedAssets.reduce<GenerationConfig>((draftConfig, asset) => {
        return bindResultReferenceToConfig(draftConfig, {
          assetId: asset.id,
          referenceImage: {
            id: createId("reference-id"),
            url: asset.objectUrl,
            fileName: asset.name,
            type: "content",
            weight: 1,
            sourceAssetId: asset.id,
          },
        });
      }, cloneGenerationConfig(input.config));

      input.setConfig(nextConfig);
      const importedAssetIds = new Set(importedAssets.map((asset) => asset.id));
      return nextConfig.referenceImages.filter((entry) =>
        entry.sourceAssetId ? importedAssetIds.has(entry.sourceAssetId) : false
      );
    },
    [input]
  );

  const bindResultAsAssetRole = useCallback(
    async (turnId: string, index: number, role: ImageGenerationAssetRefRole) => {
      const turn = input.getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result?.assetId || !input.config) {
        return;
      }

      try {
        const asset =
          useAssetStore.getState().assets.find((entry) => entry.id === result.assetId) ?? null;
        const binding =
          role === "reference" && asset
            ? {
                nextConfig: bindResultReferenceToConfig(cloneGenerationConfig(input.config), {
                  assetId: result.assetId,
                  referenceImage: {
                    id: createId("reference-id"),
                    url: asset.objectUrl,
                    fileName: asset.name,
                    type: "content",
                    weight: 1,
                    sourceAssetId: asset.id,
                  },
                }),
                error: null,
              }
            : bindResultAssetToConfig(cloneGenerationConfig(input.config), {
                assetId: result.assetId,
                role,
                includeReferenceImage: false,
                referenceImage: null,
              });
        if (binding.error) {
          input.setNotice(binding.error);
          return;
        }

        input.setConfig(binding.nextConfig);
        const notice = resolveAssetRoleNotice(role, input.supportedFeatures);
        if (notice) {
          input.setNotice(notice);
        }
      } catch (error) {
        input.setNotice(
          error instanceof Error
            ? error.message
            : "Generated image could not be reused for prompt-guided generation."
        );
      }
    },
    [input]
  );

  const updateAssetRefRole = useCallback(
    (assetId: string, role: ImageGenerationAssetRefRole) => {
      if (!input.config) {
        return;
      }

      const binding = updateAssetRefRoleInConfig(input.config, {
        assetId,
        role,
        includeReferenceImage: input.supportedFeatures.referenceImages.enabled,
      });
      if (binding.error) {
        input.setNotice(binding.error);
        return;
      }

      input.setConfig(binding.nextConfig);
      const notice = resolveAssetRoleNotice(role, input.supportedFeatures);
      if (notice) {
        input.setNotice(notice);
      }
    },
    [input]
  );

  const patchReferenceImage = useCallback(
    (id: string, patch: Partial<ReferenceImage>) => {
      if (!input.config) {
        return;
      }

      const referenceImage = input.config.referenceImages.find((entry) => entry.id === id);
      input.setConfig({
        ...input.config,
        referenceImages: input.config.referenceImages.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...patch,
              }
            : entry
        ),
        assetRefs: input.config.assetRefs.map((assetRef) =>
          assetRef.assetId === referenceImage?.sourceAssetId && assetRef.role === "reference"
            ? {
                ...assetRef,
                ...(patch.type ? { referenceType: patch.type } : {}),
                ...(typeof patch.weight === "number" ? { weight: patch.weight } : {}),
              }
            : assetRef
        ),
      });
    },
    [input]
  );

  const removeReferenceImage = useCallback(
    (id: string) => {
      if (!input.config) {
        return;
      }

      const referenceImage = input.config.referenceImages.find((entry) => entry.id === id);
      if (referenceImage?.sourceAssetId) {
        input.setConfig(removeBoundResultReferenceFromConfig(input.config, referenceImage.sourceAssetId));
        return;
      }

      input.setConfig({
        ...input.config,
        referenceImages: input.config.referenceImages.filter((entry) => entry.id !== id),
      });
    },
    [input]
  );

  const addToCanvas = useCallback(async (assetId: string | null) => {
    if (!assetId) {
      return null;
    }

    let canvasStore = useCanvasStore.getState();
    if (
      !canvasStore.activeWorkbenchId &&
      (canvasStore.workbenches.length === 0 || canvasStore.isLoading)
    ) {
      await canvasStore.init();
      canvasStore = useCanvasStore.getState();
    }
    const asset = useAssetStore.getState().assets.find((entry) => entry.id === assetId);
    if (!asset) {
      input.setNotice("The generated asset is still syncing into the asset store. Retry in a moment.");
      return null;
    }
    const startEpoch = getCanvasResetEpoch();
    let workbenchId = canvasStore.activeWorkbenchId;
    let insertionIndex = 1;
    if (workbenchId) {
      const activeWorkbench = canvasStore.workbenches.find((item) => item.id === workbenchId);
      insertionIndex = (activeWorkbench?.rootIds.length ?? 0) + 1;
    } else {
      const created = await canvasStore.createWorkbench("AI 工作台");
      if (!created || startEpoch !== getCanvasResetEpoch()) {
        return null;
      }
      workbenchId = created.id;
    }
    if (!workbenchId) {
      return null;
    }

    const { width, height } = await resolveCanvasImageInsertionSize(asset, {
      minimumShortEdge: 96,
    });
    const x = 140 + insertionIndex * 24;
    const y = 120 + insertionIndex * 24;

    const element: CanvasImageElement = {
      id: createId("node-id"),
      type: "image",
      parentId: null,
      assetId,
      x,
      y,
      width,
      height,
      rotation: 0,
      transform: {
        x,
        y,
        width,
        height,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
    };

    await canvasStore.upsertElementInWorkbench(workbenchId, element);
    const latestCanvasStore = useCanvasStore.getState();
    if (latestCanvasStore.activeWorkbenchId === workbenchId) {
      latestCanvasStore.setSelectedElementIds([element.id]);
    }
    return { workbenchId, elementId: element.id };
  }, [input]);

  return {
    materializeGeneratedAssets,
    addReferenceFiles,
    useResultAsReference: (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "reference"),
    editFromResult: (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "edit"),
    varyFromResult: (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "variation"),
    updateAssetRefRole,
    removeAssetReference: (assetId: string) => {
      if (!input.config) {
        return;
      }

      input.setConfig(removeBoundResultReferenceFromConfig(input.config, assetId));
    },
    clearAssetReferences: () => {
      if (!input.config) {
        return;
      }

      input.setConfig(clearBoundResultReferencesFromConfig(input.config));
    },
    updateReferenceImage: patchReferenceImage,
    removeReferenceImage,
    clearReferenceImages: () => {
      if (!input.config) {
        return;
      }

      input.setConfig(clearReferenceImagesFromConfig(input.config));
    },
    addToCanvas,
  };
}
