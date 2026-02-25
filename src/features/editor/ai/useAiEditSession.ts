import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { EditingAdjustments, Asset } from "@/types";
import { normalizeAdjustments } from "@/lib/adjustments";
import {
  buildPatchFromAiResult,
  sanitizeAiAdjustments,
  sanitizeFilmProfileId,
} from "@/lib/ai/sanitize";
import type { AiControllableAdjustments } from "@/lib/ai/editSchema";
import type { HistogramSummary } from "@/lib/ai/colorAnalysis";
import { DEFAULT_MODEL, type ModelOption } from "@/lib/ai/provider";
import { toRecommendationImageDataUrl } from "@/lib/ai/image";

export interface AiPendingResult {
  adjustments: AiControllableAdjustments;
  filmProfileId?: string;
}

export interface ReferenceImage {
  id: string;
  dataUrl: string;
  thumbnailUrl: string;
  histogramSummary?: HistogramSummary;
}

interface UseAiEditSessionOptions {
  selectedAsset: Asset | null;
  adjustments: EditingAdjustments | null;
  histogramSummary?: HistogramSummary;
  onApply: (adjustments: Partial<EditingAdjustments>) => void;
  onApplyFilmProfile: (filmProfileId: string | undefined) => void;
}

const STORAGE_KEY_MODEL = "filmlab:ai:model";

function loadSavedModel(): ModelOption {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODEL);
    if (raw) {
      return JSON.parse(raw) as ModelOption;
    }
  } catch {
    // ignore
  }
  return DEFAULT_MODEL;
}

export function useAiEditSession(options: UseAiEditSessionOptions) {
  const { selectedAsset, adjustments, histogramSummary, onApply, onApplyFilmProfile } = options;

  const [selectedModel, setSelectedModelState] = useState<ModelOption>(loadSavedModel);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [pendingResult, setPendingResult] = useState<AiPendingResult | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [input, setInput] = useState("");
  const preApplyAdjustmentsRef = useRef<EditingAdjustments | null>(null);
  const adjustmentsRef = useRef(adjustments);
  const histogramSummaryRef = useRef(histogramSummary);
  const selectedAssetRef = useRef(selectedAsset);
  const referenceImagesRef = useRef(referenceImages);
  const imageDataUrlRef = useRef(imageDataUrl);
  const selectedModelRef = useRef(selectedModel);
  const pendingResultRef = useRef(pendingResult);
  const isPreviewActiveRef = useRef(isPreviewActive);
  const onApplyRef = useRef(onApply);

  adjustmentsRef.current = adjustments;
  histogramSummaryRef.current = histogramSummary;
  selectedAssetRef.current = selectedAsset;
  referenceImagesRef.current = referenceImages;
  imageDataUrlRef.current = imageDataUrl;
  selectedModelRef.current = selectedModel;
  pendingResultRef.current = pendingResult;
  isPreviewActiveRef.current = isPreviewActive;
  onApplyRef.current = onApply;

  const setSelectedModel = useCallback((model: ModelOption) => {
    setSelectedModelState(model);
    try {
      localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(model));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!selectedAsset) {
      setImageDataUrl(undefined);
      return;
    }

    let cancelled = false;
    void toRecommendationImageDataUrl(selectedAsset)
      .then((url) => {
        if (!cancelled) {
          setImageDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageDataUrl(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAsset?.id]);

  const stableChatBody = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.id,
    }),
    [selectedModel.id, selectedModel.provider]
  );

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai-edit", body: stableChatBody }),
    [stableChatBody]
  );

  const {
    messages,
    sendMessage: chatSendMessage,
    status,
    stop,
    setMessages,
  } = useChat({
    transport,

    onToolCall: async ({ toolCall }: { toolCall: any }) => {
      if (toolCall.toolName === "applyAdjustments") {
        const args = toolCall.args as {
          adjustments: AiControllableAdjustments;
          filmProfileId?: string;
        };
        const sanitized = sanitizeAiAdjustments(args.adjustments);
        const filmProfileId = sanitizeFilmProfileId(args.filmProfileId);
        setPendingResult({ adjustments: sanitized, filmProfileId });
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  const applyResult = useCallback(() => {
    if (!pendingResult) return;
    const patch = buildPatchFromAiResult(adjustments, pendingResult.adjustments);
    onApply(patch);
    if (pendingResult.filmProfileId) {
      onApplyFilmProfile(pendingResult.filmProfileId);
    }
    setIsPreviewActive(false);
    preApplyAdjustmentsRef.current = null;
    setPendingResult(null);
  }, [adjustments, pendingResult, onApply, onApplyFilmProfile]);

  const previewResult = useCallback(() => {
    if (!pendingResult || !adjustments) return;
    if (!isPreviewActive) {
      preApplyAdjustmentsRef.current = { ...normalizeAdjustments(adjustments) };
    }
    const patch = buildPatchFromAiResult(adjustments, pendingResult.adjustments);
    onApply(patch);
    if (pendingResult.filmProfileId) {
      onApplyFilmProfile(pendingResult.filmProfileId);
    }
    setIsPreviewActive(true);
  }, [
    pendingResult,
    adjustments,
    isPreviewActive,
    onApply,
    onApplyFilmProfile,
  ]);

  const revertPreview = useCallback(() => {
    if (!isPreviewActive || !preApplyAdjustmentsRef.current) return;
    onApply(preApplyAdjustmentsRef.current);
    setIsPreviewActive(false);
    preApplyAdjustmentsRef.current = null;
  }, [isPreviewActive, onApply]);

  const dismissResult = useCallback(() => {
    if (isPreviewActive) {
      revertPreview();
    }
    setPendingResult(null);
  }, [isPreviewActive, revertPreview]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      void chatSendMessage(
        { text },
        {
          body: {
            provider: selectedModelRef.current.provider,
            model: selectedModelRef.current.id,
            imageDataUrl: imageDataUrlRef.current,
            histogramSummary: histogramSummaryRef.current ?? undefined,
            currentAdjustments: adjustmentsRef.current
              ? (adjustmentsRef.current as unknown as Record<string, unknown>)
              : undefined,
            currentFilmProfileId: selectedAssetRef.current?.filmProfileId ?? undefined,
            referenceImages: referenceImagesRef.current.map((ref) => ({
              imageDataUrl: ref.dataUrl,
              histogramSummary: ref.histogramSummary,
            })),
          },
        }
      );
      setInput("");
    },
    [chatSendMessage]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setPendingResult(null);
    setIsPreviewActive(false);
    preApplyAdjustmentsRef.current = null;
  }, [setMessages]);

  const addReferenceImage = useCallback((ref: ReferenceImage) => {
    setReferenceImages((prev) => {
      if (prev.length >= 3) return prev;
      if (prev.some((r) => r.id === ref.id)) return prev;
      return [...prev, ref];
    });
  }, []);

  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearReferenceImages = useCallback(() => {
    setReferenceImages([]);
  }, []);

  const stopRef = useRef(stop);
  const clearChatRef = useRef(clearChat);
  stopRef.current = stop;
  clearChatRef.current = clearChat;

  useEffect(() => {
    void stopRef.current();
    clearChatRef.current();
  }, [selectedAsset?.id]);

  useEffect(() => {
    return () => {
      void stopRef.current();
      if (
        isPreviewActiveRef.current &&
        pendingResultRef.current &&
        preApplyAdjustmentsRef.current
      ) {
        onApplyRef.current(preApplyAdjustmentsRef.current);
        preApplyAdjustmentsRef.current = null;
      }
    };
  }, []);

  return {
    // Chat state
    messages,
    input,
    setInput,
    isLoading,
    // Model
    selectedModel,
    setSelectedModel,
    // Reference images
    referenceImages,
    addReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    // AI result
    pendingResult,
    isPreviewActive,
    // Actions
    sendMessage,
    stop,
    applyResult,
    previewResult,
    revertPreview,
    dismissResult,
    clearChat,
  };
}
