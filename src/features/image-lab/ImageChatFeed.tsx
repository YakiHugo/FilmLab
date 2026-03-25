import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ImageLabObservabilityView,
  ImageLabPromptArtifactView,
} from "../../../shared/imageLabViews";
import { IMAGE_STYLE_PRESETS } from "@/lib/ai/imageStylePresets";
import { IMAGE_STYLES } from "@/lib/ai/imageStyles";
import { cn } from "@/lib/utils";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";
import { ImageResultCard } from "./ImageResultCard";

interface ImageChatFeedProps {
  turns: ImageGenerationTurn[];
  currentModelName: string;
  promptObservabilityStatus: "idle" | "loading" | "loaded" | "error";
  promptObservabilityError: string | null;
  promptObservability: ImageLabObservabilityView | null;
  onClearHistory: () => void;
  onToggleResultSelection: (turnId: string, index: number) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onAddToCanvas: (turnId: string, index: number, assetId?: string | null) => void;
  onUseResultAsReference: (turnId: string, index: number) => void;
  onEditFromResult: (turnId: string, index: number) => void;
  onVaryResult: (turnId: string, index: number) => void;
  onLoadPromptArtifacts: (turnId: string) => void | Promise<unknown>;
  onAcceptResult: (turnId: string, index: number) => void;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
  onLoadPromptObservability: () => void | Promise<unknown>;
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
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="w-[323px] shrink-0">
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

      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
        <span className="text-zinc-500">{time}</span>
        <span className="text-zinc-500">{modelName}</span>
      </div>
    </div>
  );
}

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

function MetaPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300">
      {label}
    </span>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

export const shouldAutoLoadPromptObservability = (
  isOpen: boolean,
  turnCount: number,
  status: "idle" | "loading" | "loaded" | "error"
) => isOpen && turnCount > 0 && status === "idle";

const PROMPT_ARTIFACT_STAGE_ORDER = ["rewrite", "compile", "dispatch"] as const;
const PROMPT_ARTIFACT_STAGE_LABELS: Record<
  (typeof PROMPT_ARTIFACT_STAGE_ORDER)[number],
  string
> = {
  rewrite: "Rewrite",
  compile: "Compile",
  dispatch: "Dispatch",
};

function ArtifactPromptField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!value?.trim()) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        <button
          type="button"
          className="text-xs text-zinc-400 transition hover:text-zinc-100"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              void navigator.clipboard.writeText(value);
              setCopied(true);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">
        {value}
      </pre>
    </div>
  );
}

function ArtifactJsonDetails({ label, value }: { label: string; value: unknown }) {
  if (!value) {
    return null;
  }

  return (
    <details className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
      <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-zinc-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function TurnPromptArtifactsPanel({ turn }: { turn: ImageGenerationTurn }) {
  if (turn.promptArtifactsStatus === "idle" || turn.promptArtifactsStatus === "loading") {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4 text-sm text-zinc-300">
        <div className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading prompt artifacts
        </div>
      </div>
    );
  }

  if (turn.promptArtifactsStatus === "error") {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
        {turn.promptArtifactsError ?? "Prompt artifacts could not be loaded."}
      </div>
    );
  }

  if (turn.promptArtifactsStatus === "loaded" && (turn.promptArtifacts?.length ?? 0) === 0) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4 text-sm text-zinc-400">
        No prompt artifacts were recorded for this turn.
      </div>
    );
  }

  const groupedArtifacts = PROMPT_ARTIFACT_STAGE_ORDER.map((stage) => ({
    stage,
    versions: (turn.promptArtifacts ?? []).filter((entry) => entry.stage === stage),
  })).filter((entry) => entry.versions.length > 0);

  return (
    <div className="space-y-4 rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,20,25,0.94),rgba(10,11,15,0.98))] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Prompt Artifacts</p>
          <p className="mt-1 text-sm text-zinc-300">
            Stored compiler outputs for this turn, grouped by stage.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300">
          {(turn.promptArtifacts ?? []).length} records
        </span>
      </div>

      {groupedArtifacts.map(({ stage, versions }) => (
        <section key={stage} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {PROMPT_ARTIFACT_STAGE_LABELS[stage]}
            </span>
            <span className="text-xs text-zinc-600">{versions.length}</span>
          </div>

          {versions.map((artifact) => (
            <PromptArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function PromptObservabilityPanel({
  status,
  error,
  summary,
}: {
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  summary: ImageLabObservabilityView | null;
}) {
  if (status === "idle" || status === "loading") {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4 text-sm text-zinc-300">
        <div className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading prompt observability
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
        {error ?? "Prompt observability could not be loaded."}
      </div>
    );
  }

  if (!summary || summary.overview.totalTurns === 0) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-4 text-sm text-zinc-400">
        No prompt observability data is available for this conversation yet.
      </div>
    );
  }

  const semanticLosses = [...summary.semanticLosses].sort(
    (left, right) =>
      right.occurrenceCount - left.occurrenceCount ||
      right.turnCount - left.turnCount ||
      right.latestCreatedAt.localeCompare(left.latestCreatedAt)
  );
  const recentDegradedTurns = [...summary.turns]
    .filter((turn) => turn.degraded || turn.fallback)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <div className="space-y-5 rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,20,25,0.94),rgba(10,11,15,0.98))] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Prompt Observability
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Conversation-level degradation, fallback, and semantic loss summary.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300">
          {summary.conversationId}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryPill label="Total Turns" value={summary.overview.totalTurns} />
        <SummaryPill label="With Artifacts" value={summary.overview.turnsWithArtifacts} />
        <SummaryPill label="Degraded Turns" value={summary.overview.degradedTurns} />
        <SummaryPill label="Fallback Turns" value={summary.overview.fallbackTurns} />
      </div>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Semantic Losses</p>
          <p className="mt-1 text-sm text-zinc-400">
            Ranked by artifact-level frequency across this conversation.
          </p>
        </div>
        {semanticLosses.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-400">
            No semantic losses were recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {semanticLosses.map((loss) => (
              <div
                key={loss.code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{loss.code}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Last seen {formatTurnTime(loss.latestCreatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <MetaPill label={`Occurrences ${loss.occurrenceCount}`} />
                  <MetaPill label={`Turns ${loss.turnCount}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Recent Degraded Turns
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Turns with degradation or fallback based on artifacts and executed targets.
          </p>
        </div>
        {recentDegradedTurns.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-400">
            No degraded or fallback turns were recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {recentDegradedTurns.map((turn) => (
              <div
                key={turn.turnId}
                className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{turn.prompt}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatTurnTime(turn.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {turn.degraded ? <MetaPill label="Degraded" /> : null}
                    {turn.fallback ? <MetaPill label="Fallback" /> : null}
                    <MetaPill label={`Artifacts ${turn.artifactCount}`} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span>
                    Selected {turn.selectedTargetKey ?? "unknown"}
                  </span>
                  <span>
                    Executed {turn.executedTargetKey ?? "unknown"}
                  </span>
                </div>

                {turn.semanticLossCodes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {turn.semanticLossCodes.map((code) => (
                      <span
                        key={`${turn.turnId}-${code}`}
                        className="rounded-full border border-sky-300/20 bg-sky-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-100"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PromptArtifactCard({ artifact }: { artifact: ImageLabPromptArtifactView }) {
  return (
    <article className="space-y-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MetaPill label={`v${artifact.version}`} />
        {artifact.attempt ? <MetaPill label={`Attempt ${artifact.attempt}`} /> : null}
        {artifact.targetKey ? <MetaPill label={artifact.targetKey} /> : null}
        <MetaPill label={artifact.compilerVersion} />
      </div>

      {artifact.warnings.length > 0 ? (
        <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {artifact.warnings.map((warning, index) => (
            <p key={`${artifact.id}-warning-${index}`}>{warning}</p>
          ))}
        </div>
      ) : null}

      {artifact.semanticLosses.length > 0 ? (
        <div className="space-y-2 rounded-2xl bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          {artifact.semanticLosses.map((loss, index) => (
            <div key={`${artifact.id}-loss-${index}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-300/20 bg-sky-500/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-100">
                  {loss.code}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-sky-200/80">
                  {loss.degradeMode}
                </span>
              </div>
              <p>{loss.userMessage}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <ArtifactPromptField label="Compiled Prompt" value={artifact.compiledPrompt} />
        <ArtifactPromptField label="Dispatched Prompt" value={artifact.dispatchedPrompt} />
        <ArtifactPromptField
          label="Provider Effective Prompt"
          value={artifact.providerEffectivePrompt}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ArtifactJsonDetails label="Turn Delta" value={artifact.turnDelta} />
        <ArtifactJsonDetails label="Candidate State" value={artifact.candidateStateAfter} />
        <ArtifactJsonDetails label="Prompt IR" value={artifact.promptIR} />
        <ArtifactJsonDetails label="Hashes" value={artifact.hashes} />
      </div>
    </article>
  );
}

function TurnSummaryBar({
  turn,
  providerName,
  styleLabel,
}: {
  turn: ImageGenerationTurn;
  providerName: string;
  styleLabel: string | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <MetaPill label={`Runtime ${providerName}`} />
      <MetaPill label={turn.providerModel} />
      {turn.executedTargetLabel ? <MetaPill label={`Executed ${turn.executedTargetLabel}`} /> : null}
      <MetaPill label={`Runs ${turn.runCount}`} />
      {turn.referencedAssetIds.length > 0 ? (
        <MetaPill label={`Refs ${turn.referencedAssetIds.length}`} />
      ) : null}
      {styleLabel ? <MetaPill label={`Style ${styleLabel}`} /> : null}
    </div>
  );
}

function TurnActionBar({
  turn,
  onRetryTurn,
  onTogglePromptArtifacts,
  onDownloadAll,
  onReuseParameters,
  onSaveSelectedResults,
  onDeleteTurn,
}: {
  turn: ImageGenerationTurn;
  onRetryTurn: (turnId: string) => void;
  onTogglePromptArtifacts: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onSaveSelectedResults: (turnId: string) => void;
  onDeleteTurn: (turnId: string) => void;
}) {
  const iconSize = "h-3.5 w-3.5";
  const buttonClass =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:text-zinc-600";
  const hasSelectedUnsavedResults = turn.results.some((entry) => entry.selected && !entry.saved);

  return (
    <div className="flex justify-end opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onRetryTurn(turn.id)}
          disabled={turn.status === "loading"}
        >
          <RotateCcw className={iconSize} />
          Retry
        </button>
        <button type="button" className={buttonClass} onClick={() => onReuseParameters(turn.id)}>
          <Copy className={iconSize} />
          Reuse params
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onTogglePromptArtifacts(turn.id)}
          disabled={turn.status === "loading"}
        >
          <Copy className={iconSize} />
          Artifacts
        </button>
        {turn.results.length > 0 ? (
          <button type="button" className={buttonClass} onClick={() => onDownloadAll(turn.id)}>
            <Download className={iconSize} />
            Download all
          </button>
        ) : null}
        <button
          type="button"
          className={buttonClass}
          onClick={() => onSaveSelectedResults(turn.id)}
          disabled={!hasSelectedUnsavedResults || turn.isSavingSelection}
        >
          {turn.isSavingSelection ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Check className={iconSize} />
          )}
          {turn.isSavingSelection ? "Saving" : "Save selected"}
        </button>
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

function TurnRow({
  turn,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
  onUseResultAsReference,
  onEditFromResult,
  onVaryResult,
  onLoadPromptArtifacts,
  onAcceptResult,
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
  onUseResultAsReference: (turnId: string, index: number) => void;
  onEditFromResult: (turnId: string, index: number) => void;
  onVaryResult: (turnId: string, index: number) => void;
  onLoadPromptArtifacts: (turnId: string) => void | Promise<unknown>;
  onAcceptResult: (turnId: string, index: number) => void;
  onDeleteTurn: (turnId: string) => void;
  onRetryTurn: (turnId: string) => void;
  onReuseParameters: (turnId: string) => void;
  onDownloadAll: (turnId: string) => void;
  onDownloadResult: (turnId: string, index: number) => void;
  onUpscaleResult: (turnId: string, index: number) => void;
}) {
  const meta = useMemo(() => resolveTurnMeta(turn), [turn]);
  const [promptArtifactsOpen, setPromptArtifactsOpen] = useState(false);

  const handleTogglePromptArtifacts = useCallback(
    (turnId: string) => {
      const next = !promptArtifactsOpen;
      setPromptArtifactsOpen(next);
      if (next && turn.status !== "loading") {
        void onLoadPromptArtifacts(turnId);
      }
    },
    [onLoadPromptArtifacts, promptArtifactsOpen, turn.status]
  );

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group flex gap-5 lg:items-start"
    >
      <PromptCard
        text={turn.prompt}
        time={formatTurnTime(turn.createdAt)}
        modelName={meta.modelName}
      />

      <div className="min-w-0 flex-1">
        <TurnSummaryBar turn={turn} providerName={meta.providerName} styleLabel={meta.styleLabel} />

        {turn.status === "loading" ? (
          <div className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating
          </div>
        ) : null}

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
                  onToggleSelection={() => onToggleResultSelection(turn.id, entry.index)}
                  onAddToCanvas={() => onAddToCanvas(turn.id, entry.index, entry.assetId)}
                  onUseAsReference={() => onUseResultAsReference(turn.id, entry.index)}
                  onEditFromThis={() => onEditFromResult(turn.id, entry.index)}
                  onAccept={() => onAcceptResult(turn.id, entry.index)}
                  onDownload={() => onDownloadResult(turn.id, entry.index)}
                  onUpscale={
                    meta.supportsUpscale
                      ? () => onUpscaleResult(turn.id, entry.index)
                      : undefined
                  }
                  onVary={() => onVaryResult(turn.id, entry.index)}
                />
              </div>
            ))}
          </div>
        ) : null}

        {promptArtifactsOpen ? (
          <div className="mt-4">
            <TurnPromptArtifactsPanel turn={turn} />
          </div>
        ) : null}

        <div className="mt-2">
          <TurnActionBar
            turn={turn}
            onRetryTurn={onRetryTurn}
            onTogglePromptArtifacts={handleTogglePromptArtifacts}
            onDownloadAll={onDownloadAll}
            onReuseParameters={onReuseParameters}
            onSaveSelectedResults={onSaveSelectedResults}
            onDeleteTurn={onDeleteTurn}
          />
        </div>
      </div>
    </motion.section>
  );
}

export function ImageChatFeed({
  turns,
  currentModelName,
  promptObservabilityStatus,
  promptObservabilityError,
  promptObservability,
  onClearHistory,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
  onUseResultAsReference,
  onEditFromResult,
  onVaryResult,
  onLoadPromptArtifacts,
  onAcceptResult,
  onDeleteTurn,
  onRetryTurn,
  onReuseParameters,
  onDownloadAll,
  onDownloadResult,
  onUpscaleResult,
  onLoadPromptObservability,
}: ImageChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestTurnIdRef = useRef<string | null>(null);
  const [promptObservabilityOpen, setPromptObservabilityOpen] = useState(false);

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

  useEffect(() => {
    if (turns.length === 0) {
      setPromptObservabilityOpen(false);
    }
  }, [turns.length]);

  useEffect(() => {
    if (
      !shouldAutoLoadPromptObservability(
        promptObservabilityOpen,
        turns.length,
        promptObservabilityStatus
      )
    ) {
      return;
    }

    void onLoadPromptObservability();
  }, [
    onLoadPromptObservability,
    promptObservabilityOpen,
    promptObservabilityStatus,
    turns.length,
  ]);

  const handleTogglePromptObservability = useCallback(() => {
    const next = !promptObservabilityOpen;
    setPromptObservabilityOpen(next);
    if (next && turns.length > 0 && promptObservabilityStatus === "error") {
      void onLoadPromptObservability();
    }
  }, [
    onLoadPromptObservability,
    promptObservabilityOpen,
    promptObservabilityStatus,
    turns.length,
  ]);

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-300 transition hover:border-white/16 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.02] disabled:text-zinc-600"
              onClick={handleTogglePromptObservability}
              disabled={turns.length === 0}
            >
              {promptObservabilityOpen && promptObservabilityStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {promptObservabilityOpen ? "Hide insights" : "Insights"}
            </button>
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
        </div>

        {promptObservabilityOpen ? (
          <div className="mb-6">
            <PromptObservabilityPanel
              status={promptObservabilityStatus}
              error={promptObservabilityError}
              summary={promptObservability}
            />
          </div>
        ) : null}

        <div className="space-y-6">
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                onToggleResultSelection={onToggleResultSelection}
                onSaveSelectedResults={onSaveSelectedResults}
                onAddToCanvas={onAddToCanvas}
                onUseResultAsReference={onUseResultAsReference}
                onEditFromResult={onEditFromResult}
                onVaryResult={onVaryResult}
                onLoadPromptArtifacts={onLoadPromptArtifacts}
                onAcceptResult={onAcceptResult}
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

        {turns.length === 0 ? <div className="flex-1" /> : null}
      </div>
    </div>
  );
}
