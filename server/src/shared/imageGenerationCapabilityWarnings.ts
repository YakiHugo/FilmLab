import { getFrontendImageModelById } from "../models/frontendRegistry";
import type { ParsedImageGenerationRequest } from "./imageGenerationSchema";

export const getImageGenerationCapabilityWarnings = (
  request: ParsedImageGenerationRequest
): string[] => {
  const frontendModel = getFrontendImageModelById(request.modelId);
  if (!frontendModel) {
    return [];
  }

  const warnings: string[] = [];
  const guidedAssetCount = (request.inputAssets ?? []).filter(
    (inputAsset) => inputAsset.binding === "guide"
  ).length;
  if (!frontendModel.constraints.referenceImages.enabled && guidedAssetCount > 0) {
    const count = guidedAssetCount;
    warnings.push(
      `${frontendModel.label} does not execute ${count} guide image${
        count === 1 ? "" : "s"
      } natively and will compile them into text guidance.`
    );
  }

  const hasSourceAsset = (request.inputAssets ?? []).some(
    (inputAsset) => inputAsset.binding === "source"
  );
  if (
    hasSourceAsset &&
    request.operation !== "generate" &&
    frontendModel.promptCompiler.sourceImageExecution === "unsupported"
  ) {
    warnings.push(
      `${frontendModel.label} cannot execute ${request.operation} source images natively and will compile them into text guidance.`
    );
  }

  return warnings;
};
