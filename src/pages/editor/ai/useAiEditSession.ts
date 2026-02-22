import { useCallback, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { EditingAdjustments, Asset } from "@/types";
import { normalizeAdjustments } from "@/lib/adjustments";
import { sanitizeAiAdjustments, sanitizeFilmProfileId } from "@/lib/ai/sanitize";
import type { AiControllableAdjustments } from "@/lib/ai/editSchema";
import type { HistogramSummary } from "@/lib/ai/colorAnalysis";
import { DEFAULT_MODEL, type ModelOption } from "@/lib/ai/provider";

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
  const [pendingResult, setPendingResult] = useState<AiPendingResult | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [input, setInput] = useState("");
  const preApplyAdjustmentsRef = useRef<EditingAdjustments | null>(null);

  const setSelectedModel = useCallback((model: ModelOption) => {
    setSelectedModelState(model);
    try {
      localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(model));
    } catch {
      // ignore
    }
  }, []);

  const imageDataUrl = useMemo(() => {
    // Will be set externally when the asset thumbnail is ready
    return undefined as string | undefined;
  }, []);

  const chatBody = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.id,
      imageDataUrl,
      histogramSummary: histogramSummary ?? undefined,
      currentAdjustments: adjustments ? (adjustments as unknown as Record<string, unknown>) : undefined,
      currentFilmProfileId: selectedAsset?.filmProfileId ?? undefined,
      referenceImages: referenceImages.map((ref) => ({
        imageDataUrl: ref.dataUrl,
        histogramSummary: ref.histogramSummary,
      })),
    }),
    [selectedModel, imageDataUrl, histogramSummary, adjustments, selectedAsset?.filmProfileId, referenceImages]
  );

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai-edit", body: chatBody }),
    [chatBody]
  );

  const { messages, sendMessage: chatSendMessage, status, stop, setMessages } = useChat({
    transport,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const buildAdjustmentsPatch = useCallback(
    (result: AiPendingResult): Partial<EditingAdjustments> => {
      const current = adjustments ? normalizeAdjustments(adjustments) : normalizeAdjustments(undefined);
      return {
        ...current,
        exposure: result.adjustments.exposure,
        contrast: result.adjustments.contrast,
        highlights: result.adjustments.highlights,
        shadows: result.adjustments.shadows,
        whites: result.adjustments.whites,
        blacks: result.adjustments.blacks,
        temperature: result.adjustments.temperature,
        tint: result.adjustments.tint,
        vibrance: result.adjustments.vibrance,
        saturation: result.adjustments.saturation,
        clarity: result.adjustments.clarity,
        dehaze: result.adjustments.dehaze,
        curveHighlights: result.adjustments.curveHighlights,
        curveLights: result.adjustments.curveLights,
        curveDarks: result.adjustments.curveDarks,
        curveShadows: result.adjustments.curveShadows,
        grain: result.adjustments.grain,
        grainSize: result.adjustments.grainSize,
        grainRoughness: result.adjustments.grainRoughness,
        vignette: result.adjustments.vignette,
        sharpening: result.adjustments.sharpening,
        noiseReduction: result.adjustments.noiseReduction,
        hsl: result.adjustments.hsl,
        colorGrading: result.adjustments.colorGrading,
      };
    },
    [adjustments]
  );

  const applyResult = useCallback(() => {
    if (!pendingResult) return;
    const patch = buildAdjustmentsPatch(pendingResult);
    onApply(patch);
    if (pendingResult.filmProfileId) {
      onApplyFilmProfile(pendingResult.filmProfileId);
    }
    setIsPreviewActive(false);
    preApplyAdjustmentsRef.current = null;
    setPendingResult(null);
  }, [pendingResult, buildAdjustmentsPatch, onApply, onApplyFilmProfile]);

  const previewResult = useCallback(() => {
    if (!pendingResult || !adjustments) return;
    if (!isPreviewActive) {
      preApplyAdjustmentsRef.current = { ...normalizeAdjustments(adjustments) };
    }
    const patch = buildAdjustmentsPatch(pendingResult);
    onApply(patch);
    if (pendingResult.filmProfileId) {
      onApplyFilmProfile(pendingResult.filmProfileId);
    }
    setIsPreviewActive(true);
  }, [pendingResult, adjustments, isPreviewActive, buildAdjustmentsPatch, onApply, onApplyFilmProfile]);

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
      void chatSendMessage({ text });
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
