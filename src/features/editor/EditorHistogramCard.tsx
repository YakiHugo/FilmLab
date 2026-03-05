import { memo } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorHistogram } from "./EditorHistogram";

export const EditorHistogramCard = memo(function EditorHistogramCard() {
  const histogram = useEditorStore((state) => state.previewHistogram);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1114]/80 p-3">
      <EditorHistogram histogram={histogram} />
    </div>
  );
});

