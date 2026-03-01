import { memo } from "react";
import { EditorSection } from "@/features/editor/EditorSection";
import { EditorExportPanel } from "@/features/editor/EditorExportPanel";

interface ExportPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const ExportPanel = memo(function ExportPanel({ isOpen, onToggle }: ExportPanelProps) {
  return (
    <EditorSection
      title="Export"
      hint="Format / quality / resolution / metadata"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <EditorExportPanel />
    </EditorSection>
  );
});

