export {
  DEFAULT_IMAGE_PROVIDER,
  IMAGE_PROVIDERS,
  getDefaultImageModelForProvider,
  getImageModelFeatureSupport,
  getImageModelConfig,
  getImageModelName,
  getImageProviderCredentialSlot,
  getImageProviderConfig,
  getImageProviderName,
  isImageRequestProviderId,
  isImageRuntimeProviderId,
  isImageProviderId,
  normalizeImageRequestProvider,
  type ImageModelConfig,
  type ImageProviderConfig,
  type ImageProviderCredentialSlotId,
  type ImageProviderFeatureSupport,
  type ImageReferenceImageCapability,
} from "../../../shared/imageProviderCatalog";

export type {
  ImageModelFamilyId,
  ImageProviderId,
  ImageRequestProviderId,
  RuntimeImageProviderId,
} from "../../../shared/imageGeneration";
