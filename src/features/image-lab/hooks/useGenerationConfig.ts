import { useMemo } from "react";
import { getImageModelParamDefinitions } from "@/lib/ai/imageModelParams";
import {
  IMAGE_PROVIDERS,
  getImageModelConfig,
  getImageProviderConfig,
} from "@/lib/ai/imageProviders";
import { IMAGE_STYLES } from "@/lib/ai/imageStyles";
import { useGenerationConfigStore } from "@/stores/generationConfigStore";

export function useGenerationConfig() {
  const config = useGenerationConfigStore((state) => state.config);
  const setProvider = useGenerationConfigStore((state) => state.setProvider);
  const setModel = useGenerationConfigStore((state) => state.setModel);
  const updateConfig = useGenerationConfigStore((state) => state.updateConfig);
  const addReferenceImages = useGenerationConfigStore((state) => state.addReferenceImages);
  const updateReferenceImage = useGenerationConfigStore((state) => state.updateReferenceImage);
  const removeReferenceImage = useGenerationConfigStore((state) => state.removeReferenceImage);
  const clearReferenceImages = useGenerationConfigStore((state) => state.clearReferenceImages);

  const providerConfig = useMemo(
    () => getImageProviderConfig(config.provider) ?? IMAGE_PROVIDERS[0]!,
    [config.provider]
  );
  const modelConfig = useMemo(
    () =>
      getImageModelConfig(config.provider, config.model) ??
      providerConfig.models[0]!,
    [config.model, config.provider, providerConfig.models]
  );
  const modelParamDefinitions = useMemo(
    () => getImageModelParamDefinitions(config.provider, config.model),
    [config.model, config.provider]
  );
  const supportedFeatures = useMemo(
    () => modelConfig.supportedFeatures,
    [modelConfig.supportedFeatures]
  );

  return {
    config,
    providers: IMAGE_PROVIDERS,
    styles: IMAGE_STYLES,
    providerConfig,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    setProvider,
    setModel,
    updateConfig,
    addReferenceImages,
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
  };
}
