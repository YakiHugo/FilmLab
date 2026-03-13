import { memo, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorHistogram } from "./EditorHistogram";
import { EditorWaveform } from "./EditorWaveform";

export const EditorHistogramCard = memo(function EditorHistogramCard() {
  const histogram = useEditorStore((state) => state.previewHistogram);
  const waveform = useEditorStore((state) => state.previewWaveform);
  const [scopeView, setScopeView] = useState<"histogram" | "waveform">("histogram");

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1114]/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-100">Scopes</p>
          <p className="text-[11px] text-slate-500">Preview-derived analysis</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-[11px] transition ${
              scopeView === "histogram"
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setScopeView("histogram")}
          >
            Histogram
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-[11px] transition ${
              scopeView === "waveform"
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setScopeView("waveform")}
          >
            Waveform
          </button>
        </div>
      </div>
      {scopeView === "histogram" ? (
        <EditorHistogram histogram={histogram} />
      ) : (
        <EditorWaveform waveform={waveform} />
      )}
    </div>
  );
});
