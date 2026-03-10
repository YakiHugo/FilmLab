import { AnimatePresence, motion } from "framer-motion";
import { Download, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
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

function TurnWarnings({
  warnings,
  compact = false,
}: {
  warnings: string[];
  compact?: boolean;
}) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "mb-3 rounded-2xl border border-amber-400/18 bg-amber-500/10 px-4 py-3 text-amber-100",
        compact ? "text-xs" : "text-sm"
      )}
    >
      {warnings.map((warning, index) => (
        <p key={`${warning}-${index}`}>{warning}</p>
      ))}
    </div>
  );
}

function TurnTags({ turn, compact = false }: { turn: ImageGenerationTurn; compact?: boolean }) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);
  const items = [
    `Model ${meta.modelName}`,
    `Runtime ${meta.providerName}`,
    turn.providerModel,
    meta.styleLabel,
    turn.displayAspectRatio,
    turn.displayReferenceImageCount > 0
      ? `${turn.displayReferenceImageCount} refs`
      : null,
  ].filter((value): value is string => Boolean(value));
  const itemCounts = new Map<string, number>();

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const nextCount = (itemCounts.get(item) ?? 0) + 1;
        itemCounts.set(item, nextCount);
        return (
          <span
            key={`${item}-${nextCount}`}
            className={cn(
              "rounded-full border border-white/10 bg-white/[0.04] font-medium text-zinc-300",
              compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
            )}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
}

function LoadingShelf({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "shrink-0 overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.03]",
            compact ? "w-[140px]" : "w-[235px]"
          )}
        >
          <div
            className={cn(
              "animate-pulse bg-white/[0.07]",
              compact ? "aspect-square" : "aspect-[4/5]"
            )}
          />
        </div>
      ))}
    </div>
  );
}

function LatestTurnStage({
  turn,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
}: {
  turn: ImageGenerationTurn;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
}) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);
  const selectedUnsavedCount = turn.results.filter(
    (entry) => entry.selected && !entry.saved
  ).length;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="grid gap-6 pt-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start"
    >
      <div className="max-w-[360px] rounded-[30px] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_54px_rgba(0,0,0,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Prompt</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{formatTurnTime(turn.createdAt)}</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-white/16 hover:bg-white/[0.08] hover:text-zinc-200"
              onClick={() => onDeleteTurn(turn.id)}
              aria-label="Delete turn"
              title="Delete turn"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-[17px] leading-8 text-zinc-50">{turn.prompt}</p>
        <TurnTags turn={turn} />
        <button
          type="button"
          className="mt-4 text-sm font-medium text-zinc-300 transition hover:text-white"
          onClick={() => onReuseParameters(turn.id)}
        >
          Reuse params
        </button>
      </div>

      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-200">
            {turn.status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
                Generating
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-zinc-300" />
                {turn.results.length > 0 ? `${turn.results.length} results` : "Latest batch"}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 transition hover:border-white/16 hover:bg-white/[0.08]"
              onClick={() => onRetryTurn(turn.id)}
              disabled={turn.status === "loading"}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Retry
            </button>
            {turn.results.length > 0 ? (
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 transition hover:border-white/16 hover:bg-white/[0.08]"
                onClick={() => onDownloadAll(turn.id)}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Download all
              </button>
            ) : null}
            {turn.results.length > 0 ? (
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition",
                  selectedUnsavedCount > 0 && !turn.isSavingSelection
                    ? "border-white/14 bg-white/[0.08] text-zinc-100 hover:bg-white/[0.12]"
                    : "border-white/8 bg-white/[0.03] text-zinc-500"
                )}
                onClick={() => onSaveSelectedResults(turn.id)}
                disabled={selectedUnsavedCount === 0 || turn.isSavingSelection}
              >
                {turn.isSavingSelection ? "Saving..." : "Save selected"}
              </button>
            ) : null}
          </div>
        </div>

        {turn.status === "loading" && turn.results.length === 0 ? <LoadingShelf /> : null}

        {turn.error ? (
          <div className="mb-3 rounded-full border border-rose-400/18 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
            {turn.error}
          </div>
        ) : null}

        <TurnWarnings warnings={turn.warnings} />

        {turn.results.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {turn.results.map((entry) => (
              <div key={`${turn.id}-${entry.index}`} className="w-[235px] shrink-0">
                <ImageResultCard
                  imageUrl={entry.imageUrl}
                  provider={entry.provider}
                  model={entry.model}
                  assetId={entry.assetId}
                  selected={entry.selected}
                  saved={entry.saved}
                  isUpscaling={entry.isUpscaling}
                  upscaleError={entry.upscaleError}
                  onToggleSelection={() => onToggleResultSelection(turn.id, entry.index)}
                  onAddToCanvas={() => onAddToCanvas(turn.id, entry.index, entry.assetId)}
                  onDownload={() => onDownloadResult(turn.id, entry.index)}
                  onUpscale={
                    meta.supportsUpscale ? () => onUpscaleResult(turn.id, entry.index) : undefined
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}

function HistoryTurnRow({
  turn,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
}: {
  turn: ImageGenerationTurn;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
}) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);
  const selectedUnsavedCount = turn.results.filter(
    (entry) => entry.selected && !entry.saved
  ).length;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="grid gap-4 border-t border-white/6 pt-5 lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <div className="max-w-[280px] rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Prompt</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">{formatTurnTime(turn.createdAt)}</span>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-white/16 hover:bg-white/[0.08] hover:text-zinc-200"
              onClick={() => onDeleteTurn(turn.id)}
              aria-label="Delete turn"
              title="Delete turn"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
          {turn.prompt}
        </p>
        <TurnTags turn={turn} compact />
        <button
          type="button"
          className="mt-3 text-xs font-medium text-zinc-300 transition hover:text-white"
          onClick={() => onReuseParameters(turn.id)}
        >
          Reuse params
        </button>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">
            {turn.status === "loading"
              ? "Generating"
              : turn.error
                ? "Error"
                : `${turn.results.length} results`}
          </span>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition hover:border-white/16 hover:bg-white/[0.08]"
            onClick={() => onRetryTurn(turn.id)}
            disabled={turn.status === "loading"}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </button>
          {turn.results.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition hover:border-white/16 hover:bg-white/[0.08]"
              onClick={() => onDownloadAll(turn.id)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download all
            </button>
          ) : null}
          {turn.results.length > 0 ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-medium transition",
                selectedUnsavedCount > 0 && !turn.isSavingSelection
                  ? "border-white/12 bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]"
                  : "border-white/8 bg-white/[0.02] text-zinc-600"
              )}
              onClick={() => onSaveSelectedResults(turn.id)}
              disabled={selectedUnsavedCount === 0 || turn.isSavingSelection}
            >
              {turn.isSavingSelection ? "Saving..." : "Save"}
            </button>
          ) : null}
        </div>

        {turn.status === "loading" && turn.results.length === 0 ? <LoadingShelf compact /> : null}

        {turn.error ? (
          <div className="mb-3 rounded-2xl border border-rose-400/14 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
            {turn.error}
          </div>
        ) : null}

        <TurnWarnings warnings={turn.warnings} compact />

        {turn.results.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {turn.results.map((entry) => (
              <div key={`${turn.id}-${entry.index}`} className="w-[165px] shrink-0">
                <ImageResultCard
                  imageUrl={entry.imageUrl}
                  provider={entry.provider}
                  model={entry.model}
                  assetId={entry.assetId}
                  selected={entry.selected}
                  saved={entry.saved}
                  compact
                  isUpscaling={entry.isUpscaling}
                  upscaleError={entry.upscaleError}
                  onToggleSelection={() => onToggleResultSelection(turn.id, entry.index)}
                  onAddToCanvas={() => onAddToCanvas(turn.id, entry.index, entry.assetId)}
                  onDownload={() => onDownloadResult(turn.id, entry.index)}
                  onUpscale={
                    meta.supportsUpscale ? () => onUpscaleResult(turn.id, entry.index) : undefined
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

export function ImageChatFeed({
  turns,
  currentModelName,
  onClearHistory,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
}: ImageChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestTurnIdRef = useRef<string | null>(null);
  const latestTurn = turns[0] ?? null;
  const historyTurns = turns.slice(1);

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
        <div className="mb-4 flex items-center justify-between gap-3">
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

        {latestTurn ? (
          <LatestTurnStage
            turn={latestTurn}
            onToggleResultSelection={onToggleResultSelection}
            onSaveSelectedResults={onSaveSelectedResults}
            onAddToCanvas={onAddToCanvas}
            onDeleteTurn={onDeleteTurn}
            onRetryTurn={onRetryTurn}
            onReuseParameters={onReuseParameters}
            onDownloadAll={onDownloadAll}
            onDownloadResult={onDownloadResult}
            onUpscaleResult={onUpscaleResult}
          />
        ) : (
          <div className="flex-1" />
        )}

        {historyTurns.length > 0 ? (
          <div className="mt-12 space-y-4">
            <AnimatePresence initial={false}>
              {historyTurns.map((turn) => (
                <HistoryTurnRow
                  key={turn.id}
                  turn={turn}
                  onToggleResultSelection={onToggleResultSelection}
                  onSaveSelectedResults={onSaveSelectedResults}
                  onAddToCanvas={onAddToCanvas}
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
        ) : null}
      </div>
    </div>
  );
}
