import type { AssetService } from "../../../assets/service";
import type { ResolvedProviderInputAsset } from "../../../assets/types";
import type { ResolvedRouteTarget } from "../../../gateway/router/types";
import type { ParsedImageGenerationRequest } from "../../../shared/imageGenerationSchema";
import { projectInputAssetsForModelExecution } from "../../../shared/imageInputAssetExecution";

export type InputAssetProjectionInput = {
  userId: string;
  target: ResolvedRouteTarget;
  payload: ParsedImageGenerationRequest;
  effectiveRetryMode: "exact" | "recompile";
};

export class InputAssetProjector {
  constructor(private readonly deps: { assetService: AssetService }) {}

  async projectForDispatch(input: InputAssetProjectionInput): Promise<ResolvedProviderInputAsset[]> {
    const { userId, target, payload, effectiveRetryMode } = input;
    if (effectiveRetryMode === "exact") {
      return this.deps.assetService.resolveProviderInputAssets(
        userId,
        (payload.inputAssets ?? []).map((entry) => ({ ...entry }))
      );
    }
    return this.deps.assetService.resolveProviderInputAssets(
      userId,
      projectInputAssetsForModelExecution({
        inputAssets: payload.inputAssets ?? [],
        operation: payload.operation,
        promptCompiler: target.frontendModel.promptCompiler,
      })
    );
  }
}
