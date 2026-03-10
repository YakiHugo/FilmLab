import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import { getImageGenerationCapabilityWarnings } from "../shared/imageGenerationCapabilityWarnings";

/**
 * @deprecated use getImageGenerationCapabilityWarnings instead.
 */
export const getReferenceImageWarningsForUnsupportedProvider = (
  request: ParsedImageGenerationRequest
) => getImageGenerationCapabilityWarnings(request);
