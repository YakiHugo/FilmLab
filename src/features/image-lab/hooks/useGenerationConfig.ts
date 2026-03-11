import { useEffect, useMemo } from "react";
import {
  getImageModelCatalogEntry,
  getRuntimeProviderEntry,
  toCatalogFeatureSupport,
} from "@/lib/ai/imageModelCatalog";
import {
  useGenerationConfigStore,
  type GenerationConfig,
} from "@/stores/generationConfigStore";
import { IMAGE_STYLES } from "@/lib/ai/imageStyles";
import { useImageModelCatalog } from "./useImageModelCatalog";

export function useGenerationConfig() {
  const { catalog, isLoading: isCatalogLoading, error: catalogError } = useImageModelCatalog();
  const config = useGenerationConfigStore((state) => state.config);
  const setConfigInStore = useGenerationConfigStore((state) => state.setConfig);
  const initializeFromModel = useGenerationConfigStore((state) => state.initializeFromModel);
  const setModelInStore = useGenerationConfigStore((state) => state.setModel);
  const updateConfigInStore = useGenerationConfigStore((state) => state.updateConfig);
  const addReferenceImagesInStore = useGenerationConfigStore((state) => state.addReferenceImages);
  const updateReferenceImageInStore = useGenerationConfigStore((state) => state.updateReferenceImage);
  const removeReferenceImageInStore = useGenerationConfigStore((state) => state.removeReferenceImage);
  const clearReferenceImagesInStore = useGenerationConfigStore((state) => state.clearReferenceImages);

  const visibleModels = catalog?.models ?? [];
  const selectedModel = useMemo(
    () => getImageModelCatalogEntry(catalog, config?.modelId ?? visibleModels[0]?.id),
    [catalog, config?.modelId, visibleModels]
  );

  useEffect(() => {
    if (!catalog || visibleModels.length === 0) {
      return;
    }

    if (!config) {
      initializeFromModel(visibleModels[0]!);
      return;
    }

    if (!selectedModel) {
      setModelInStore(visibleModels[0]!);
    }
  }, [catalog, config, initializeFromModel, selectedModel, setModelInStore, visibleModels]);

  const providerEntry = useMemo(
    () => getRuntimeProviderEntry(catalog, selectedModel?.defaultProvider),
    [catalog, selectedModel?.defaultProvider]
  );
  const providerFeatures = useMemo(
    () => toCatalogFeatureSupport(selectedModel),
    [selectedModel]
  );

  return {
    catalog,
    catalogError,
    isCatalogLoading,
    config,
    models: visibleModels,
    providers: catalog?.providers ?? [],
    styles: IMAGE_STYLES,
    modelConfig: selectedModel,
    providerEntry,
    modelParamDefinitions: selectedModel?.parameterDefinitions ?? [],
    supportedFeatures: providerFeatures,
    setConfig: (nextConfig: GenerationConfig) => {
      const nextModel = getImageModelCatalogEntry(catalog, nextConfig.modelId);
      if (!nextModel) {
        return;
      }
      setConfigInStore(nextConfig, nextModel);
    },
    setModel: (modelId: string) => {
      const nextModel = getImageModelCatalogEntry(catalog, modelId);
      if (!nextModel) {
        return;
      }
      setModelInStore(nextModel);
    },
    updateConfig: (patch: Parameters<typeof updateConfigInStore>[0]) =>
      updateConfigInStore(patch, selectedModel),
    addReferenceImages: (entries: Parameters<typeof addReferenceImagesInStore>[0]) =>
      addReferenceImagesInStore(entries, selectedModel),
    updateReferenceImage: (
      id: string,
      patch: Parameters<typeof updateReferenceImageInStore>[1]
    ) => updateReferenceImageInStore(id, patch, selectedModel),
    removeReferenceImage: (id: string) => removeReferenceImageInStore(id, selectedModel),
    clearReferenceImages: () => clearReferenceImagesInStore(selectedModel),
  };
}
