import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { IMAGE_STYLE_PRESETS } from "@/lib/ai/imageStylePresets";
import { IMAGE_STYLES } from "@/lib/ai/imageStyles";
import { getImageProviderConfig } from "@/lib/ai/imageProviders";
import { cn } from "@/lib/utils";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";
import { ImageResultCard } from "./ImageResultCard";

interface ImageChatFeedProps {
  turns: ImageGenerationTurn[];
  currentModelName: string;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
}

const formatTurnTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const resolveTurnMeta = (turn: ImageGenerationTurn) => {
  const provider = getImageProviderConfig(turn.configSnapshot.provider);
  const model = provider?.models.find((entry) => entry.id === turn.configSnapshot.model);
  const preset = IMAGE_STYLE_PRESETS.find(
    (entry) => entry.stylePreset === turn.configSnapshot.stylePreset
  );
  const style =
    IMAGE_STYLES.find((entry) => entry.id === turn.configSnapshot.style) ?? IMAGE_STYLES[0];

  return {
    providerName: provider?.name ?? turn.configSnapshot.provider,
    modelName: model?.name ?? turn.configSnapshot.model,
    styleLabel: preset?.title ?? (style?.id !== "none" ? style?.label : null),
  };
};

function TurnTags({ turn, compact = false }: { turn: ImageGenerationTurn; compact?: boolean }) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);
  const items = [
    meta.providerName,
    meta.modelName,
    meta.styleLabel,
    turn.configSnapshot.aspectRatio,
    turn.configSnapshot.referenceImages.length > 0
      ? `${turn.configSnapshot.referenceImages.length} refs`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-full border border-white/10 bg-white/[0.04] font-medium text-zinc-300",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
          )}
        >
          {item}
        </span>
      ))}
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
          <div className={cn("animate-pulse bg-white/[0.07]", compact ? "aspect-square" : "aspect-[4/5]")} />
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
}: {
  turn: ImageGenerationTurn;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
}) {
  const selectedUnsavedCount = turn.results.filter((entry) => entry.selected && !entry.saved).length;

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
          <span className="text-xs text-zinc-500">{formatTurnTime(turn.createdAt)}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-[17px] leading-8 text-zinc-50">
          {turn.prompt}
        </p>
        <TurnTags turn={turn} />
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

        {turn.status === "loading" && turn.results.length === 0 ? <LoadingShelf /> : null}

        {turn.error ? (
          <div className="mb-3 rounded-full border border-rose-400/18 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
            {turn.error}
          </div>
        ) : null}

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
                  onToggleSelection={() => onToggleResultSelection(turn.id, entry.index)}
                  onAddToCanvas={() => onAddToCanvas(turn.id, entry.index, entry.assetId)}
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
}: {
  turn: ImageGenerationTurn;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
}) {
  const selectedUnsavedCount = turn.results.filter((entry) => entry.selected && !entry.saved).length;

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
          <span className="text-[11px] text-zinc-500">{formatTurnTime(turn.createdAt)}</span>
        </div>
        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
          {turn.prompt}
        </p>
        <TurnTags turn={turn} compact />
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {turn.status === "loading"
              ? "Generating"
              : turn.error
                ? "Error"
                : `${turn.results.length} results`}
          </span>
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
                  onToggleSelection={() => onToggleResultSelection(turn.id, entry.index)}
                  onAddToCanvas={() => onAddToCanvas(turn.id, entry.index, entry.assetId)}
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
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
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
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#050506] px-6 pb-6 pt-8 lg:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-[1650px] flex-col">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
          <span className="text-zinc-500">Model</span>
          <span>{currentModelName}</span>
        </div>

        {latestTurn ? (
          <LatestTurnStage
            turn={latestTurn}
            onToggleResultSelection={onToggleResultSelection}
            onSaveSelectedResults={onSaveSelectedResults}
            onAddToCanvas={onAddToCanvas}
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
                />
              ))}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </div>
  );
}
