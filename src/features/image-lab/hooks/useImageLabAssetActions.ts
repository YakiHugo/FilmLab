import { useCallback, useEffect, useRef } from "react";
import { createCanvasImageElementFromAsset } from "@/features/canvas/imageNodeFactory";
import { importAssetFiles } from "@/lib/assetImport";
import { fetchRemoteAsset } from "@/lib/assetSyncApi";
import { getCanvasResetEpoch, useCanvasStore } from "@/stores/canvasStore";
import { useAssetStore } from "@/stores/assetStore";
import { resolveCanvasImageInsertionSize } from "@/utils";
import {
  bindGuideAssetToConfig,
  clearGuideAssetsFromConfig,
  clearSourceAssetFromConfig,
  removeInputAssetFromConfig,
  setSourceAssetInConfig,
  updateGuideAssetInConfig,
} from "../referenceImages";
import type { ImageGenerationTurn } from "./imageLabViewState";
import { cloneGenerationConfig } from "./imageLabViewState";
import type { CatalogDrivenFeatureSupport } from "@/lib/ai/imageModelCatalog";
import type { GenerationConfig } from "@/stores/generationConfigStore";

export type ImageInputIntent = "guide" | "edit" | "variation";

const resolveInputIntentNotice = (
  intent: ImageInputIntent,
  supportedFeatures: CatalogDrivenFeatureSupport
) => {
  if (intent === "guide" && !supportedFeatures.referenceImages.enabled) {
    return "This model will fall back to text-only guidance for image references.";
  }
  if (intent === "edit" && supportedFeatures.promptCompiler.sourceImageExecution === "unsupported") {
    return "This model does not execute direct image edits and will fall back to text guidance.";
  }
  if (intent === "variation" && supportedFeatures.promptCompiler.sourceImageExecution === "unsupported") {
    return "This model does not execute direct image variations and will fall back to text guidance.";
  }
  if (
    intent === "edit" &&
    supportedFeatures.promptCompiler.sourceImageExecution === "reference_guided"
  ) {
    return "This model approximates image edits as reference-guided generation.";
  }
  if (
    intent === "variation" &&
    supportedFeatures.promptCompiler.sourceImageExecution === "reference_guided"
  ) {
    return "This model approximates image variations as reference-guided generation.";
  }
  return null;
};

export function useImageLabAssetActions(input: {
  config: GenerationConfig | null;
  getConfig: () => GenerationConfig | null;
  setConfig: (config: GenerationConfig) => void;
  supportedFeatures: CatalogDrivenFeatureSupport;
  setNotice: (message: string | null) => void;
  getUiTurnById: (turnId: string) => ImageGenerationTurn | null;
}) {
  const materializeRemoteAssets = useAssetStore((state) => state.materializeRemoteAssets);
  const guideMetadataMemoryRef = useRef<
    Map<string, { guideType: "style" | "content" | "controlnet"; weight: number }>
  >(new Map());

  const rememberGuideMetadata = useCallback((config: GenerationConfig, assetId: string) => {
    const guideAsset = config.inputAssets.find(
      (entry) => entry.assetId === assetId && entry.binding === "guide"
    );
    if (!guideAsset) {
      return;
    }

    guideMetadataMemoryRef.current.set(assetId, {
      guideType: guideAsset.guideType ?? "content",
      weight: guideAsset.weight ?? 1,
    });
  }, []);

  const forgetGuideMetadata = useCallback((assetIds: string[]) => {
    assetIds.forEach((assetId) => {
      guideMetadataMemoryRef.current.delete(assetId);
    });
  }, []);

  const resolveGuideBindingDefaults = useCallback((assetId: string) => {
    const remembered = guideMetadataMemoryRef.current.get(assetId);
    return remembered ?? { guideType: "content" as const, weight: 1 };
  }, []);

  useEffect(() => {
    const activeSourceAssetIds = new Set(
      (input.config?.inputAssets ?? [])
        .filter((entry) => entry.binding === "source")
        .map((entry) => entry.assetId)
    );
    for (const assetId of guideMetadataMemoryRef.current.keys()) {
      if (!activeSourceAssetIds.has(assetId)) {
        guideMetadataMemoryRef.current.delete(assetId);
      }
    }
  }, [input.config]);

  const materializeGeneratedAssets = useCallback(
    async (
      assetIds: string[],
      fallbacks?: Array<{ assetId: string; imageUrl: string; createdAt: string }>
    ) => {
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

  const importInputAssets = useCallback(async (files: FileList) => {
    if (files.length === 0) {
      return [];
    }

    const imported = await importAssetFiles(files, {
      source: "imported",
      origin: "file",
    });
    return imported.resolvedAssetIds;
  }, []);

  const bindGuideAssets = useCallback(
    (assetIds: string[]) => {
      const currentConfig = input.getConfig();
      if (!currentConfig || assetIds.length === 0) {
        return [];
      }

      const nextConfig = assetIds.reduce<GenerationConfig>(
        (draftConfig, assetId) =>
          bindGuideAssetToConfig(draftConfig, {
            assetId,
            ...resolveGuideBindingDefaults(assetId),
          }),
        cloneGenerationConfig(currentConfig)
      );

      input.setConfig(nextConfig);
      return assetIds;
    },
    [input, resolveGuideBindingDefaults]
  );

  const bindResultWithIntent = useCallback(
    (turnId: string, index: number, intent: ImageInputIntent) => {
      const turn = input.getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      const currentConfig = input.getConfig();
      if (!result?.assetId || !currentConfig) {
        return;
      }

      if (intent !== "guide") {
        rememberGuideMetadata(currentConfig, result.assetId);
      }
      const nextConfig =
        intent === "guide"
          ? bindGuideAssetToConfig(cloneGenerationConfig(currentConfig), {
              assetId: result.assetId,
              ...resolveGuideBindingDefaults(result.assetId),
            })
          : setSourceAssetInConfig(cloneGenerationConfig(currentConfig), {
              assetId: result.assetId,
              operation: intent,
            });

      input.setConfig(nextConfig);
      const notice = resolveInputIntentNotice(intent, input.supportedFeatures);
      if (notice) {
        input.setNotice(notice);
      }
    },
    [input, rememberGuideMetadata, resolveGuideBindingDefaults]
  );

  const updateInputIntent = useCallback(
    (assetId: string, intent: ImageInputIntent) => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      if (intent !== "guide") {
        rememberGuideMetadata(currentConfig, assetId);
      }
      const nextConfig =
        intent === "guide"
          ? bindGuideAssetToConfig(currentConfig, {
              assetId,
              ...resolveGuideBindingDefaults(assetId),
            })
          : setSourceAssetInConfig(currentConfig, {
              assetId,
              operation: intent,
            });

      input.setConfig(nextConfig);
      const notice = resolveInputIntentNotice(intent, input.supportedFeatures);
      if (notice) {
        input.setNotice(notice);
      }
    },
    [input, rememberGuideMetadata, resolveGuideBindingDefaults]
  );

  const updateGuideAsset = useCallback(
    (
      assetId: string,
      patch: {
        guideType?: "style" | "content" | "controlnet";
        weight?: number;
      }
    ) => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      const nextConfig = updateGuideAssetInConfig(currentConfig, assetId, patch);
      const nextGuideAsset = nextConfig.inputAssets.find(
        (entry) => entry.assetId === assetId && entry.binding === "guide"
      );
      if (nextGuideAsset) {
        guideMetadataMemoryRef.current.set(assetId, {
          guideType: nextGuideAsset.guideType ?? "content",
          weight: nextGuideAsset.weight ?? 1,
        });
      }
      input.setConfig(nextConfig);
    },
    [input]
  );

  const addToCanvas = useCallback(
    async (assetId: string | null) => {
      if (!assetId) {
        return null;
      }

      let canvasStore = useCanvasStore.getState();
      if (
        !canvasStore.loadedWorkbenchId &&
        (canvasStore.workbenchList.length === 0 || canvasStore.isLoading)
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
      let workbenchId = canvasStore.loadedWorkbenchId;
      let insertionIndex = 1;
      if (workbenchId) {
        const activeWorkbench =
          canvasStore.loadedWorkbenchId === workbenchId
            ? canvasStore.workbenchDraft ?? canvasStore.workbench
            : null;
        insertionIndex = (activeWorkbench?.rootIds.length ?? 0) + 1;
      } else {
        const created = await canvasStore.createWorkbench("AI 宸ヤ綔鍙?");
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

      const element = createCanvasImageElementFromAsset({
        asset,
        x,
        y,
        width,
        height,
      });

      await canvasStore.upsertElementInWorkbench(workbenchId, element);
      const latestCanvasStore = useCanvasStore.getState();
      if (latestCanvasStore.loadedWorkbenchId === workbenchId) {
        latestCanvasStore.setSelectedElementIds([element.id]);
      }
      return { workbenchId, elementId: element.id };
    },
    [input]
  );

  return {
    materializeGeneratedAssets,
    importInputAssets,
    bindGuideAssets,
    useResultAsReference: (turnId: string, index: number) =>
      bindResultWithIntent(turnId, index, "guide"),
    editFromResult: (turnId: string, index: number) =>
      bindResultWithIntent(turnId, index, "edit"),
    varyFromResult: (turnId: string, index: number) =>
      bindResultWithIntent(turnId, index, "variation"),
    updateInputIntent,
    removeInputAsset: (assetId: string) => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      forgetGuideMetadata([assetId]);
      input.setConfig(removeInputAssetFromConfig(currentConfig, assetId));
    },
    clearSourceAsset: () => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      const sourceAssetIds = currentConfig.inputAssets
        .filter((entry) => entry.binding === "source")
        .map((entry) => entry.assetId);
      forgetGuideMetadata(sourceAssetIds);
      input.setConfig(clearSourceAssetFromConfig(currentConfig));
    },
    updateGuideAsset,
    clearGuideAssets: () => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      forgetGuideMetadata(
        currentConfig.inputAssets
          .filter((entry) => entry.binding === "guide")
          .map((entry) => entry.assetId)
      );
      input.setConfig(clearGuideAssetsFromConfig(currentConfig));
    },
    clearAllInputAssets: () => {
      const currentConfig = input.getConfig();
      if (!currentConfig) {
        return;
      }

      forgetGuideMetadata(currentConfig.inputAssets.map((entry) => entry.assetId));
      input.setConfig({
        ...currentConfig,
        operation: "generate",
        inputAssets: [],
      });
    },
    addToCanvas,
  };
}
