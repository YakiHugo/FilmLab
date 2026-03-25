import { useCallback, useRef } from "react";
import type { ImageLabConversationView } from "../../../../shared/imageLabViews";
import type { ImageGenerationRequestError } from "@/lib/ai/imageGeneration";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
import {
  acceptImageConversationTurn,
  clearImageConversation,
  deleteImageConversationTurn,
} from "@/lib/ai/imageConversation";
import type { ImageModelCatalog, ImageModelCatalogEntry } from "@/lib/ai/imageModelCatalog";
import { createId } from "@/utils";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import {
  omitUnavailableReferenceImages,
  toImageGenerationRequest,
  type ImageGenerationTurn,
  type PendingConversationTurn,
} from "./imageLabViewState";

const buildUnavailableModelError = (modelLabel: string) =>
  `${modelLabel} is no longer available. Choose a current model and run the prompt again.`;

export function useImageLabCommands(input: {
  catalog: ImageModelCatalog | null | undefined;
  modelConfig: ImageModelCatalogEntry | null | undefined;
  getConversationId: () => string | null;
  applyConversation: (conversation: ImageLabConversationView) => ImageLabConversationView;
  refreshConversation: (conversationId?: string) => Promise<ImageLabConversationView | null>;
  materializeGeneratedAssets: (
    assetIds: string[],
    fallbacks?: Array<{ assetId: string; imageUrl: string; createdAt: string }>
  ) => Promise<void>;
  enqueuePendingTurn: (turn: PendingConversationTurn) => void;
  clearPendingTurn: (turnId: string) => void;
  clearAllPendingTurns: () => void;
  clearRuntimeTurnState: (turnId: string) => void;
  clearPromptArtifactState: (turnId: string) => void;
  clearAllPromptArtifactState: () => void;
  resetPromptObservabilityState: (conversationId?: string | null) => void;
  setTurnSavingState: (turnId: string, isSaving: boolean) => void;
  updateRuntimeResultState: (
    turnId: string,
    index: number,
    updater: (state: { selected?: boolean; isUpscaling?: boolean; upscaleError?: string | null }) => {
      selected?: boolean;
      isUpscaling?: boolean;
      upscaleError?: string | null;
    }
  ) => void;
  setNotice: (message: string | null) => void;
  getUiTurnById: (turnId: string) => ImageGenerationTurn | null;
}) {
  const generationRequestRef = useRef<{
    controller: AbortController;
    turnId: string;
  } | null>(null);

  const cancelActiveGeneration = useCallback((notice?: string) => {
    if (!generationRequestRef.current) {
      return;
    }

    generationRequestRef.current.controller.abort();
    if (notice) {
      input.setNotice(notice);
    }
  }, [input]);

  const runGeneration = useCallback(
    async (
      prompt: string,
      configSnapshot: GenerationConfig,
      options?: { retryOfTurnId?: string; localWarnings?: string[] }
    ) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        return null;
      }
      if (!input.catalog || !input.modelConfig) {
        return null;
      }

      cancelActiveGeneration("Generation canceled by a newer request.");

      const turnId = createId("turn-id");
      const jobId = createId("job-id");
      const controller = new AbortController();
      const requestPayload = {
        ...toImageGenerationRequest(trimmedPrompt, configSnapshot),
        ...(input.getConversationId() ? { conversationId: input.getConversationId() ?? undefined } : {}),
        ...(options?.retryOfTurnId
          ? { retryOfTurnId: options.retryOfTurnId, retryMode: "exact" as const }
          : {}),
        clientTurnId: turnId,
        clientJobId: jobId,
      };

      generationRequestRef.current = {
        controller,
        turnId,
      };

      input.enqueuePendingTurn({
        id: turnId,
        prompt: trimmedPrompt,
        request: configSnapshot,
        createdAt: new Date().toISOString(),
        runtimeProvider: input.modelConfig.defaultProvider,
        providerModel: input.modelConfig.providerModel,
      });

      try {
        const response = await requestImageGeneration(requestPayload, {
          signal: controller.signal,
        });
        await input.materializeGeneratedAssets(
          response.primaryAssetIds,
          response.images.map((image) => ({
            assetId: image.assetId,
            imageUrl: image.imageUrl,
            createdAt: response.createdAt,
          }))
        );
        input.clearPendingTurn(turnId);
        await input.refreshConversation(response.conversationId);
        return response;
      } catch (error) {
        input.clearPendingTurn(turnId);
        const requestError = error as ImageGenerationRequestError;
        if (requestError?.conversationId) {
          void input.refreshConversation(requestError.conversationId).catch(() => undefined);
        }

        if (!(error instanceof Error && error.name === "AbortError")) {
          input.setNotice(error instanceof Error ? error.message : "Image generation failed.");
        }
        return null;
      } finally {
        if (generationRequestRef.current?.controller === controller) {
          generationRequestRef.current = null;
        }
      }
    },
    [cancelActiveGeneration, input]
  );

  const deleteTurn = useCallback(
    async (turnId: string) => {
      if (generationRequestRef.current?.turnId === turnId) {
        cancelActiveGeneration("Generation canceled while deleting the turn.");
        generationRequestRef.current = null;
      }

      try {
        const conversation = await deleteImageConversationTurn(turnId);
        input.applyConversation(conversation);
        input.clearPendingTurn(turnId);
        input.clearRuntimeTurnState(turnId);
        input.clearPromptArtifactState(turnId);
      } catch (error) {
        input.setNotice(error instanceof Error ? error.message : "Turn could not be deleted.");
      }
    },
    [cancelActiveGeneration, input]
  );

  const acceptTurnResult = useCallback(
    async (turnId: string, index: number) => {
      const turn = input.getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result?.assetId) {
        return null;
      }

      try {
        const conversation = await acceptImageConversationTurn(turnId, result.assetId);
        input.applyConversation(conversation);
        return conversation;
      } catch (error) {
        input.setNotice(error instanceof Error ? error.message : "Result could not be accepted.");
        return null;
      }
    },
    [input]
  );

  const retryTurn = useCallback(
    async (turnId: string) => {
      const uiTurn = input.getUiTurnById(turnId);
      if (!uiTurn) {
        return null;
      }

      const matchingModel = input.catalog?.models.find((model) => model.id === uiTurn.selectedModelId);
      if (!matchingModel) {
        input.setNotice(buildUnavailableModelError(uiTurn.selectedModelLabel));
        return null;
      }

      const retryConfig = omitUnavailableReferenceImages(uiTurn.configSnapshot);
      if (retryConfig.warnings.length > 0) {
        input.setNotice(retryConfig.warnings[0] ?? null);
      }

      return runGeneration(uiTurn.prompt, retryConfig.config, {
        retryOfTurnId: turnId,
        localWarnings: retryConfig.warnings,
      });
    },
    [input, runGeneration]
  );

  const clearSession = useCallback(async () => {
    cancelActiveGeneration("Generation canceled while clearing the conversation.");
    generationRequestRef.current = null;
    input.clearAllPendingTurns();
    input.clearAllPromptArtifactState();
    input.resetPromptObservabilityState(null);
    const conversation = await clearImageConversation();
    input.applyConversation(conversation);
  }, [cancelActiveGeneration, input]);

  const saveSelectedResults = useCallback(async (turnId: string) => {
    input.setTurnSavingState(turnId, true);
    input.setTurnSavingState(turnId, false);
    return null;
  }, [input]);

  const toggleResultSelection = useCallback(
    (turnId: string, index: number) => {
      const turn = input.getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result || result.saved) {
        return;
      }

      input.updateRuntimeResultState(turnId, index, (state) => ({
        ...state,
        selected: !(state.selected ?? !result.saved),
      }));
    },
    [input]
  );

  const upscaleResult = useCallback(
    async (turnId: string, index: number) => {
      input.updateRuntimeResultState(turnId, index, (state) => ({
        ...state,
        isUpscaling: false,
        upscaleError: "Upscale is not available for current providers.",
      }));
      return null;
    },
    [input]
  );

  return {
    runGeneration,
    deleteTurn,
    acceptTurnResult,
    retryTurn,
    clearSession,
    saveSelectedResults,
    toggleResultSelection,
    upscaleResult,
    cancelActiveGeneration,
  };
}
