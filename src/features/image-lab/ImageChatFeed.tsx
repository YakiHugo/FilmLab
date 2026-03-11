import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_STYLE_PRESETS } from "@/lib/ai/imageStylePresets";
import { IMAGE_STYLES } from "@/lib/ai/imageStyles";
import { cn } from "@/lib/utils";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";
import { ImageResultCard } from "./ImageResultCard";

interface ImageChatFeedProps {
  turns: ImageGenerationTurn[];
  currentModelName: string;
  onClearHistory: () => void;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
}

const formatTurnTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const resolveTurnMeta = (turn: ImageGenerationTurn) => {
  const preset = IMAGE_STYLE_PRESETS.find(
    (entry) => entry.stylePreset === turn.displayStylePresetId
  );
  const style =
    IMAGE_STYLES.find((entry) => entry.id === turn.displayStyleId) ?? IMAGE_STYLES[0];

  return {
    providerName: turn.runtimeProviderLabel,
    modelName: turn.selectedModelLabel,
    styleLabel: preset?.title ?? (style?.id !== "none" ? style?.label : null),
    supportsUpscale: false,
  };
};

/* ------------------------------------------------------------------ */
/*  PromptCard — 323px wide, 20px padding, max-h 240px scrollable     */
/* ------------------------------------------------------------------ */

function PromptCard({
  text,
  time,
  modelName,
}: {
  text: string;
  time: string;
  modelName: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="w-[323px] shrink-0">
      {/* Prompt body — bg card, no border, 20px padding, max 240px with scroll */}
      <div className="max-h-[240px] overflow-y-auto rounded-xl bg-white/[0.04] p-5">
        <button
          type="button"
          className="group/prompt w-full cursor-pointer whitespace-pre-wrap text-left text-[14px] leading-6 text-zinc-100 transition"
          onClick={handleCopy}
          title="Click to copy prompt"
        >
          {text}
          <span
            className={cn(
              "ml-2 inline-flex items-center gap-1 align-middle text-xs transition-colors",
              copied
                ? "text-emerald-400"
                : "text-transparent group-hover/prompt:text-zinc-500"
            )}
          >
            {copied ? (
              <>
                <Check className="inline h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="inline h-3 w-3" />
                Copy
              </>
            )}
          </span>
        </button>
      </div>

      {/* Meta row — outside the card, below */}
      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
        <span className="text-zinc-500">{time}</span>
        <span className="text-zinc-500">{modelName}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TurnActionBar — ghost buttons with text labels, ~12px             */
/* ------------------------------------------------------------------ */

function TurnActionBar({
  turn,
  onRetryTurn,
  onDownloadAll,
  onReuseParameters,
  onDeleteTurn,
}: {
  turn: ImageGenerationTurn;
  onRetryTurn: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDeleteTurn: (turnId: string) => void;
}) {
  const iconSize = "h-3.5 w-3.5";
  const btnClass =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:text-zinc-600";

  return (
    <div className="flex justify-end opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={btnClass}
          onClick={() => onRetryTurn(turn.id)}
          disabled={turn.status === "loading"}
        >
          <RotateCcw className={iconSize} />
          Retry
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => onReuseParameters(turn.id)}
        >
          <Copy className={iconSize} />
          Reuse params
        </button>
        {turn.results.length > 0 && (
          <button
            type="button"
            className={btnClass}
            onClick={() => onDownloadAll(turn.id)}
          >
            <Download className={iconSize} />
            Download all
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:text-zinc-600"
          onClick={() => onDeleteTurn(turn.id)}
        >
          <Trash2 className={iconSize} />
          Delete
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function TurnWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      {warnings.map((warning, index) => (
        <p key={`${warning}-${index}`}>{warning}</p>
      ))}
    </div>
  );
}

function LoadingShelf() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-[227.5px] w-[227.5px] shrink-0 overflow-hidden rounded-xl bg-white/[0.03]"
        >
          <div className="h-full w-full animate-pulse bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TurnRow — unified layout for all turns                            */
/* ------------------------------------------------------------------ */

function TurnRow({
  turn,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
}: {
  turn: ImageGenerationTurn;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
}) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group flex gap-5 lg:items-start"
    >
      {/* Prompt card — fixed 323px */}
      <PromptCard
        text={turn.prompt}
        time={formatTurnTime(turn.createdAt)}
        modelName={meta.modelName}
      />

      {/* Results column */}
      <div className="min-w-0 flex-1">
        {turn.status === "loading" && (
          <div className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating
          </div>
        )}

        {turn.status === "loading" && turn.results.length === 0 ? <LoadingShelf /> : null}

        {turn.error ? (
          <div className="mb-3 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {turn.error}
          </div>
        ) : null}

        <TurnWarnings warnings={turn.warnings} />

        {turn.results.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {turn.results.map((entry) => (
              <div key={`${turn.id}-${entry.index}`} className="shrink-0">
                <ImageResultCard
                  imageUrl={entry.imageUrl}
                  provider={entry.provider}
                  model={entry.model}
                  assetId={entry.assetId}
                  selected={entry.selected}
                  saved={entry.saved}
                  isUpscaling={entry.isUpscaling}
                  upscaleError={entry.upscaleError}
                  onToggleSelection={() => {}}
                  onAddToCanvas={() => {}}
                  onDownload={() => onDownloadResult(turn.id, entry.index)}
                  onUpscale={
                    meta.supportsUpscale
                      ? () => onUpscaleResult(turn.id, entry.index)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-2">
          <TurnActionBar
            turn={turn}
            onRetryTurn={onRetryTurn}
            onDownloadAll={onDownloadAll}
            onReuseParameters={onReuseParameters}
            onDeleteTurn={onDeleteTurn}
          />
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  ImageChatFeed (top-level)                                          */
/* ------------------------------------------------------------------ */

export function ImageChatFeed({
  turns,
  currentModelName,
  onClearHistory,
  onToggleResultSelection: _onToggleResultSelection,
  onSaveSelectedResults: _onSaveSelectedResults,
  onAddToCanvas: _onAddToCanvas,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
}: ImageChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestTurnIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextLatestTurnId = turns[0]?.id ?? null;
    if (!scrollRef.current || !nextLatestTurnId || latestTurnIdRef.current === nextLatestTurnId) {
      latestTurnIdRef.current = nextLatestTurnId;
      return;
    }

    scrollRef.current.scrollTo({
      top: 0,
      behavior: latestTurnIdRef.current ? "smooth" : "auto",
    });
    latestTurnIdRef.current = nextLatestTurnId;
  }, [turns]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto bg-[#050506] px-6 pb-6 pt-8 lg:px-8"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1650px] flex-col">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <span className="text-zinc-500">Model</span>
            <span>{currentModelName}</span>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-300 transition hover:border-white/16 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.02] disabled:text-zinc-600"
            onClick={onClearHistory}
            disabled={turns.length === 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Clear history
          </button>
        </div>

        <div className="space-y-6">
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                onDeleteTurn={onDeleteTurn}
                onRetryTurn={onRetryTurn}
                onReuseParameters={onReuseParameters}
                onDownloadAll={onDownloadAll}
                onDownloadResult={onDownloadResult}
                onUpscaleResult={onUpscaleResult}
              />
            ))}
          </AnimatePresence>
        </div>

        {turns.length === 0 && <div className="flex-1" />}
      </div>
    </div>
  );
}
