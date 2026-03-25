import { useCallback, useEffect, useMemo, useRef } from "react";
import { getImageModelCatalogEntry, toCatalogFeatureSupport } from "@/lib/ai/imageModelCatalog";
import type { ImageAspectRatio } from "../../../../shared/imageGeneration";
import {
  clearReferenceInputsForUnsupportedModel,
} from "../referenceImages";
import { useGenerationConfig } from "./useGenerationConfig";
import { useImageLabConversation } from "./useImageLabConversation";
import { useImageLabUiState } from "./useImageLabUiState";
import { useImageLabAssetActions } from "./useImageLabAssetActions";
import { useImageLabCommands } from "./useImageLabCommands";
import {
  cloneGenerationConfig,
  mergeTurnsWithPending,
  omitUnavailableReferenceImages,
  toGenerationConfigFromRequest,
} from "./imageLabViewState";

export type { GeneratedResultItem, ImageGenerationTurn } from "./imageLabViewState";
export {
  invalidatePromptObservabilityState,
  omitUnavailableReferenceImages,
  RETRY_REFERENCE_IMAGES_OMITTED_WARNING,
  shouldFetchPromptArtifacts,
  shouldFetchPromptObservability,
  toImageGenerationRequest,
} from "./imageLabViewState";

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

  const getUiTurnById = useCallback(
    (turnId: string) => turnsRef.current.find((turn) => turn.id === turnId) ?? null,
    []
  );

  const assetActions = useImageLabAssetActions({
    config,
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

      const nextConfigBase = {
        ...config,
        modelId: nextModel.id,
        modelParams: { ...nextModel.defaults.modelParams },
      };

      if (
        !toCatalogFeatureSupport(nextModel).referenceImages.enabled &&
        (config.referenceImages.length > 0 || config.assetRefs.length > 0)
      ) {
        const { nextConfig, removedReferenceImageCount, removedAssetRefCount } =
          clearReferenceInputsForUnsupportedModel(nextConfigBase);
        const removedInputCount = Math.max(removedReferenceImageCount, removedAssetRefCount);
        setConfig(nextConfig);
        ui.setNotice(
          `Switched to ${nextModel.label}. Removed ${removedInputCount} image-guided input${
            removedInputCount === 1 ? "" : "s"
          } because this model does not support image-guided generation.`
        );
        return;
      }

      setConfig(nextConfigBase);
    },
    [catalog, config, setConfig, setModelInConfig, ui]
  );

  const generateFromPromptInput = useCallback(
    async (input: { text: string }) =>
      config ? commands.runGeneration(input.text, cloneGenerationConfig(config)) : null,
    [commands, config]
  );

  const retryTurn = useCallback(
    async (turnId: string) => {
      const turn = getUiTurnById(turnId);
      if (!turn) {
        return null;
      }

      const retryConfig = omitUnavailableReferenceImages(turn.configSnapshot);
      if (retryConfig.warnings.length > 0) {
        ui.setNotice(retryConfig.warnings[0] ?? null);
      }

      return commands.runGeneration(turn.prompt, retryConfig.config, {
        retryOfTurnId: turnId,
        localWarnings: retryConfig.warnings,
      });
    },
    [commands, getUiTurnById, ui]
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
      setConfig({
        ...nextConfig,
        referenceImages: [],
        assetRefs: [],
      });
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
    addReferenceFiles: assetActions.addReferenceFiles,
    updateReferenceImage: assetActions.updateReferenceImage,
    removeReferenceImage: assetActions.removeReferenceImage,
    clearReferenceImages: assetActions.clearReferenceImages,
    removeAssetReference: assetActions.removeAssetReference,
    updateAssetRefRole: assetActions.updateAssetRefRole,
    clearAssetReferences: assetActions.clearAssetReferences,
    useResultAsReference: assetActions.useResultAsReference,
    editFromResult: assetActions.editFromResult,
    varyFromResult: assetActions.varyFromResult,
    loadPromptArtifacts: ui.loadPromptArtifacts,
    loadPromptObservability: ui.loadPromptObservability,
    generateFromPromptInput,
    deleteTurn: commands.deleteTurn,
    acceptTurnResult: commands.acceptTurnResult,
    retryTurn,
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
