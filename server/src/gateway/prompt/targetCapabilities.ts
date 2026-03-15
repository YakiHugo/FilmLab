import type { FrontendModelSpec, ResolvedRouteTarget } from "../router/types";

export interface PromptCompilerTargetCapabilities {
  promptSurface: "natural_language";
  nativeNegativePrompt: boolean;
  supportsSourceImageExecution: boolean;
  textContinuity: "strong" | "moderate" | "weak";
  styleReferenceMode: "native" | "collapsed";
}

export const PROMPT_CAPABILITY_VERSION = "prompt-capabilities.v1";

const getModelCapabilities = (
  model: FrontendModelSpec
): PromptCompilerTargetCapabilities => {
  switch (model.id) {
    case "qwen-image-2-pro":
      return {
        promptSurface: "natural_language",
        nativeNegativePrompt: true,
        supportsSourceImageExecution: true,
        textContinuity: "strong",
        styleReferenceMode: "native",
      };
    case "qwen-image-2":
      return {
        promptSurface: "natural_language",
        nativeNegativePrompt: true,
        supportsSourceImageExecution: false,
        textContinuity: "moderate",
        styleReferenceMode: "collapsed",
      };
    case "kling-v2-1":
    case "kling-v3":
      return {
        promptSurface: "natural_language",
        nativeNegativePrompt: true,
        supportsSourceImageExecution: false,
        textContinuity: "moderate",
        styleReferenceMode: "collapsed",
      };
    case "zimage-turbo":
      return {
        promptSurface: "natural_language",
        nativeNegativePrompt: false,
        supportsSourceImageExecution: false,
        textContinuity: "moderate",
        styleReferenceMode: "collapsed",
      };
    case "seedream-v4":
    case "seedream-v5":
    default:
      return {
        promptSurface: "natural_language",
        nativeNegativePrompt: false,
        supportsSourceImageExecution: false,
        textContinuity: "weak",
        styleReferenceMode: "collapsed",
      };
  }
};

export const getPromptCompilerCapabilities = (
  target: ResolvedRouteTarget
): PromptCompilerTargetCapabilities => getModelCapabilities(target.frontendModel);
