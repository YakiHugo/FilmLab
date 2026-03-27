import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getImageModelCatalogEntry,
  sanitizeGenerationConfigWithCatalog,
  toCatalogFeatureSupport,
} from "@/lib/ai/imageModelCatalog";
import type { ImageAspectRatio } from "../../../../shared/imageGeneration";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import { useGenerationConfig } from "./useGenerationConfig";
import { useImageLabConversation } from "./useImageLabConversation";
import { useImageLabUiState } from "./useImageLabUiState";
import { useImageLabAssetActions } from "./useImageLabAssetActions";
import { useImageLabCommands } from "./useImageLabCommands";
import {
  cloneGenerationConfig,
  mergeTurnsWithPending,
  toGenerationConfigFromRequest,
} from "./imageLabViewState";

export type { GeneratedResultItem, ImageGenerationTurn } from "./imageLabViewState";
export {
  invalidatePromptObservabilityState,
  shouldFetchPromptArtifacts,
  shouldFetchPromptObservability,
  toImageGenerationRequest,
} from "./imageLabViewState";

const describeModelSwitchInputAssetChanges = (
  currentConfig: GenerationConfig,
  nextConfig: GenerationConfig
) => {
  const currentGuides = currentConfig.inputAssets.filter((entry) => entry.binding === "guide");
  const nextGuides = nextConfig.inputAssets.filter((entry) => entry.binding === "guide");
  const currentSources = currentConfig.inputAssets.filter((entry) => entry.binding === "source");
  const nextGuideById = new Map(nextGuides.map((entry) => [entry.assetId, entry]));
  const nextSourceIds = new Set(
    nextConfig.inputAssets
      .filter((entry) => entry.binding === "source")
      .map((entry) => entry.assetId)
  );
  const droppedGuideCount = currentGuides.filter((entry) => !nextGuideById.has(entry.assetId)).length;
  const droppedSourceCount = currentSources.filter((entry) => !nextSourceIds.has(entry.assetId)).length;
  const remappedGuideTypes = currentGuides.some((entry) => {
    const nextEntry = nextGuideById.get(entry.assetId);
    return nextEntry && (nextEntry.guideType ?? "content") !== (entry.guideType ?? "content");
  });
  const normalizedGuideWeights = currentGuides.some((entry) => {
    const nextEntry = nextGuideById.get(entry.assetId);
    return nextEntry && (nextEntry.weight ?? 1) !== (entry.weight ?? 1);
  });

  return [
    ...(droppedGuideCount > 0
      ? [
          `${droppedGuideCount} guide image${droppedGuideCount === 1 ? "" : "s"} ${
            droppedGuideCount === 1 ? "was" : "were"
          } removed to fit the target model`,
        ]
      : []),
    ...(droppedSourceCount > 0
      ? [`${droppedSourceCount} source image${droppedSourceCount === 1 ? "" : "s"} could not be kept on the target model`]
      : []),
    ...(remappedGuideTypes ? ["unsupported guide types were remapped"] : []),
    ...(normalizedGuideWeights ? ["guide weights were normalized"] : []),
  ];
};

const haveModelParamsChanged = (
  currentConfig: GenerationConfig,
  nextConfig: GenerationConfig
) => {
  const keys = new Set([
    ...Object.keys(currentConfig.modelParams),
    ...Object.keys(nextConfig.modelParams),
  ]);
  for (const key of keys) {
    if (currentConfig.modelParams[key] !== nextConfig.modelParams[key]) {
      return true;
    }
  }
  return false;
};

const describeModelSwitchRequestChanges = (
  currentConfig: GenerationConfig,
  nextConfig: GenerationConfig
) => [
  ...((currentConfig.aspectRatio !== nextConfig.aspectRatio ||
    currentConfig.width !== nextConfig.width ||
    currentConfig.height !== nextConfig.height)
    ? ["output sizing was adjusted"]
    : []),
  ...(currentConfig.batchSize !== nextConfig.batchSize ? ["batch size was adjusted"] : []),
  ...((currentConfig.style !== nextConfig.style ||
    currentConfig.stylePreset !== nextConfig.stylePreset)
    ? ["style hints were adjusted"]
    : []),
  ...(currentConfig.negativePrompt !== nextConfig.negativePrompt
    ? [
        currentConfig.negativePrompt.trim().length > 0 && nextConfig.negativePrompt.trim().length === 0
          ? "negative prompt was cleared"
          : "negative prompt was adjusted",
      ]
    : []),
  ...((currentConfig.seed !== nextConfig.seed ||
    currentConfig.guidanceScale !== nextConfig.guidanceScale ||
    currentConfig.steps !== nextConfig.steps ||
    currentConfig.sampler !== nextConfig.sampler)
    ? ["generation controls were adjusted"]
    : []),
  ...(haveModelParamsChanged(currentConfig, nextConfig) ? ["model-specific params were reset"] : []),
];

export function useImageGeneration() {
  const {
    catalog,
    catalogError,
    isCatalogLoading,
    config,
    models,
    providers,
    styles,
    modelConfig,
    modelParamDefinitions,
  supportedFeatures,
  setConfig,
  setModel: setModelInConfig,
  updateConfig,
  } = useGenerationConfig();

  const conversation = useImageLabConversation();
  const conversationTurnsById = useMemo(
    () => new Map((conversation.conversation?.turns ?? []).map((turn) => [turn.id, turn])),
    [conversation.conversation?.turns]
  );
  const getConversationTurnById = useCallback(
    (turnId: string) => conversationTurnsById.get(turnId) ?? null,
    [conversationTurnsById]
  );

  const ui = useImageLabUiState(
    () => conversation.conversation?.conversationId ?? null,
    getConversationTurnById
  );

  useEffect(() => {
    ui.syncConversationBoundary(conversation.conversation?.conversationId ?? null);
  }, [conversation.conversation?.conversationId, ui]);

  useEffect(() => {
    ui.resetPromptObservabilityState(conversation.conversation?.conversationId ?? null);
  }, [conversation.conversation?.conversationId, conversation.conversation?.updatedAt, ui]);

  useEffect(() => {
    if (!conversation.conversation) {
      return;
    }

    const committedTurnIds = new Set(conversation.conversation.turns.map((turn) => turn.id));
    ui.pendingTurns.forEach((turn) => {
      if (committedTurnIds.has(turn.id)) {
        ui.clearPendingTurn(turn.id);
      }
    });
  }, [conversation.conversation, ui]);

  useEffect(() => {
    if (!conversation.conversationError) {
      return;
    }

    ui.setNotice(conversation.conversationError);
  }, [conversation.conversationError, ui]);

  const turns = useMemo(
    () =>
      mergeTurnsWithPending(
        conversation.conversation,
        ui.pendingTurns,
        ui.runtimeResults,
        ui.savingTurnIds,
        ui.promptArtifacts,
        catalog
      ),
    [
      catalog,
      conversation.conversation,
      ui.pendingTurns,
      ui.promptArtifacts,
      ui.runtimeResults,
      ui.savingTurnIds,
    ]
  );

  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const configRef = useRef(config);
  configRef.current = config;

  const getUiTurnById = useCallback(
    (turnId: string) => turnsRef.current.find((turn) => turn.id === turnId) ?? null,
    []
  );

  const assetActions = useImageLabAssetActions({
    config,
    getConfig: () => configRef.current,
    setConfig,
    supportedFeatures,
    setNotice: ui.setNotice,
    getUiTurnById,
  });

  const commands = useImageLabCommands({
    catalog,
    modelConfig,
    getConversationId: () => conversation.conversation?.conversationId ?? null,
    applyConversation: conversation.applyConversation,
    refreshConversation: conversation.refreshConversation,
    materializeGeneratedAssets: assetActions.materializeGeneratedAssets,
    enqueuePendingTurn: ui.enqueuePendingTurn,
    clearPendingTurn: ui.clearPendingTurn,
    clearAllPendingTurns: ui.clearAllPendingTurns,
    clearRuntimeTurnState: ui.clearRuntimeTurnState,
    clearPromptArtifactState: ui.clearPromptArtifactState,
    clearAllPromptArtifactState: ui.clearAllPromptArtifactState,
    resetPromptObservabilityState: ui.resetPromptObservabilityState,
    setTurnSavingState: ui.setTurnSavingState,
    updateRuntimeResultState: ui.updateRuntimeResultState,
    setNotice: ui.setNotice,
    getUiTurnById,
  });

  const aspectRatioOptions = useMemo<ImageAspectRatio[]>(
    () => modelConfig?.constraints.supportedAspectRatios ?? ["1:1"],
    [modelConfig?.constraints.supportedAspectRatios]
  );

  const isGenerating = useMemo(() => ui.pendingTurns.length > 0, [ui.pendingTurns.length]);

  const setModel = useCallback(
    (modelId: string) => {
      const nextModel = getImageModelCatalogEntry(catalog, modelId);
      if (!nextModel) {
        return;
      }

      if (!config) {
        setModelInConfig(modelId);
        return;
      }
      if (config.modelId === nextModel.id) {
        return;
      }

      const nextConfigBase = {
        ...config,
        modelId: nextModel.id,
        modelParams: { ...nextModel.defaults.modelParams },
      };
      const nextConfig = sanitizeGenerationConfigWithCatalog(nextConfigBase, nextModel);
      const requestChangeLabels = describeModelSwitchRequestChanges(config, nextConfig);

      setConfig(nextConfig);
      const nextFeatureSupport = toCatalogFeatureSupport(nextModel);
      const sanitizedInputLabels = describeModelSwitchInputAssetChanges(config, nextConfig);
      const hasGuideAssets = config.inputAssets.some((entry) => entry.binding === "guide");
      const hasSourceAsset = config.inputAssets.some((entry) => entry.binding === "source");
      const fallsBackGuideAssets =
        hasGuideAssets && !nextFeatureSupport.referenceImages.enabled;
      const fallsBackSourceAsset =
        hasSourceAsset && nextFeatureSupport.promptCompiler.sourceImageExecution !== "native";

      if (
        requestChangeLabels.length === 0 &&
        sanitizedInputLabels.length === 0 &&
        !fallsBackGuideAssets &&
        !fallsBackSourceAsset
      ) {
        return;
      }

      const changeLabels = [
        ...requestChangeLabels,
        ...sanitizedInputLabels,
        ...(fallsBackGuideAssets ? ["guide images will be compiled into text guidance"] : []),
        ...(() => {
          if (!fallsBackSourceAsset) {
            return [];
          }
          return nextFeatureSupport.promptCompiler.sourceImageExecution === "reference_guided"
            ? ["source image operations will run as reference-guided generation"]
            : ["source image operations will be compiled into text guidance"];
        })(),
      ];
      ui.setNotice(
        `Switched to ${nextModel.label}. ${changeLabels.join(" and ")}.`
      );
    },
    [catalog, config, setConfig, setModelInConfig, ui]
  );

  const generateFromPromptInput = useCallback(
    async (input: { text: string }) =>
      config ? commands.runGeneration(input.text, cloneGenerationConfig(config)) : null,
    [commands, config]
  );

  const reuseParameters = useCallback(
    (turnId: string) => {
      const turn = getUiTurnById(turnId);
      if (!turn) {
        return null;
      }

      const nextModel = getImageModelCatalogEntry(catalog, turn.selectedModelId);
      if (!nextModel) {
        ui.setNotice(
          `${turn.selectedModelLabel} is no longer available. Choose a current model and run the prompt again.`
        );
        return turn.prompt;
      }

      const persistedRequest = conversationTurnsById.get(turnId)?.request;
      const nextConfig = persistedRequest
        ? toGenerationConfigFromRequest(persistedRequest)
        : cloneGenerationConfig(turn.configSnapshot);
      setConfig(nextConfig);
      return turn.prompt;
    },
    [catalog, conversationTurnsById, getUiTurnById, setConfig, ui]
  );

  return {
    turns,
    notice: ui.notice,
    isGenerating,
    isCatalogLoading,
    catalogError,
    promptObservabilityStatus: ui.promptObservability?.status ?? "idle",
    promptObservabilityError: ui.promptObservability?.error ?? null,
    promptObservability: ui.promptObservability?.summary ?? null,
    config,
    models,
    providers,
    styles,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    aspectRatioOptions,
    setModel,
    updateConfig,
    importInputAssets: assetActions.importInputAssets,
    bindGuideAssets: assetActions.bindGuideAssets,
    updateGuideAsset: assetActions.updateGuideAsset,
    clearGuideAssets: assetActions.clearGuideAssets,
    removeInputAsset: assetActions.removeInputAsset,
    updateInputIntent: assetActions.updateInputIntent,
    clearSourceAsset: assetActions.clearSourceAsset,
    clearAllInputAssets: assetActions.clearAllInputAssets,
    useResultAsReference: assetActions.useResultAsReference,
    editFromResult: assetActions.editFromResult,
    varyFromResult: assetActions.varyFromResult,
    loadPromptArtifacts: ui.loadPromptArtifacts,
    loadPromptObservability: ui.loadPromptObservability,
    generateFromPromptInput,
    deleteTurn: commands.deleteTurn,
    acceptTurnResult: commands.acceptTurnResult,
    retryTurn: commands.retryTurn,
    reuseParameters,
    upscaleResult: commands.upscaleResult,
    toggleResultSelection: commands.toggleResultSelection,
    saveSelectedResults: commands.saveSelectedResults,
    addToCanvas: async (turnId: string, index?: number, assetId?: string | null) => {
      const turn = getUiTurnById(turnId);
      if (!turn) {
        return null;
      }

      const finalAssetId =
        assetId ??
        (typeof index === "number"
          ? (turn.results.find((entry) => entry.index === index)?.assetId ?? null)
          : (turn.results.find((entry) => entry.assetId)?.assetId ?? null));
      return assetActions.addToCanvas(finalAssetId);
    },
    clearSession: commands.clearSession,
  };
}
