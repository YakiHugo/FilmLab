import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { PersistedPromptSnapshot } from "../../../../shared/chatImageTypes";

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const formatAssetRefSummary = (request: ParsedImageGenerationRequest) => {
  if (!Array.isArray(request.assetRefs) || request.assetRefs.length === 0) {
    return null;
  }

  return request.assetRefs
    .map((assetRef, index) => `#${index + 1} ${assetRef.role}:${assetRef.assetId}`)
    .join(", ");
};

export const compileImagePrompt = (
  request: ParsedImageGenerationRequest
): PersistedPromptSnapshot => {
  const originalPrompt = request.prompt.trim();
  const parts = [normalizeWhitespace(originalPrompt)];
  const assetRefSummary = formatAssetRefSummary(request);

  if (assetRefSummary) {
    parts.push(`Referenced assets: ${assetRefSummary}`);
  }

  return {
    originalPrompt,
    compiledPrompt: parts.join("\n"),
    providerTransformedPrompt: null,
    actualPrompt: null,
  };
};

export const withExecutedPrompt = (
  prompt: PersistedPromptSnapshot,
  actualPrompt: string | null
): PersistedPromptSnapshot => ({
  ...prompt,
  actualPrompt: actualPrompt?.trim() ? actualPrompt.trim() : prompt.compiledPrompt,
});
