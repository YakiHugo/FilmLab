import { useState } from "react";
import { cn } from "@/lib/utils";
import type { EditingAdjustments } from "@/types";
import { EditorCropSection } from "../EditorCropSection";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorPresetCard } from "../EditorPresetCard";
import {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorLayerActions,
  useEditorSelectionState,
  useEditorViewState,
} from "../useEditorSlices";
import { BasicPanel } from "../components/panels/BasicPanel";
import { DetailPanel } from "../components/panels/DetailPanel";
import { EffectsPanel } from "../components/panels/EffectsPanel";
import { ExportPanel } from "../components/panels/ExportPanel";
import { LayerPropertiesPanel } from "../components/panels/LayerPropertiesPanel";

function hasBasicChanges(adjustments: EditingAdjustments): boolean {
  return (
    adjustments.exposure !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.highlights !== 0 ||
    adjustments.shadows !== 0 ||
    adjustments.whites !== 0 ||
    adjustments.blacks !== 0 ||
    adjustments.temperature !== 0 ||
    adjustments.tint !== 0 ||
    adjustments.vibrance !== 0 ||
    adjustments.saturation !== 0
  );
}

function hasEffectsChanges(adjustments: EditingAdjustments): boolean {
  return (
    adjustments.texture !== 0 ||
    adjustments.clarity !== 0 ||
    adjustments.dehaze !== 0 ||
    adjustments.grain !== 0 ||
    adjustments.vignette !== 0 ||
    adjustments.glowIntensity !== 0
  );
}

function hasDetailChanges(adjustments: EditingAdjustments): boolean {
  return (
    adjustments.sharpening !== 0 ||
    adjustments.noiseReduction !== 0 ||
    adjustments.colorNoiseReduction !== 0
  );
}

function hasCropChanges(adjustments: EditingAdjustments): boolean {
  return (
    adjustments.rotate !== 0 ||
    adjustments.rightAngleRotation !== 0 ||
    adjustments.perspectiveHorizontal !== 0 ||
    adjustments.perspectiveVertical !== 0 ||
    adjustments.horizontal !== 0 ||
    adjustments.vertical !== 0 ||
    adjustments.scale !== 100 ||
    adjustments.flipHorizontal !== false ||
    adjustments.flipVertical !== false ||
    adjustments.aspectRatio !== "original"
  );
}

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const { adjustments } = useEditorAdjustmentState();
  const {
    previewAdjustmentValue,
    toggleAdjustmentGroupVisibility,
    toggleFlip,
    updateAdjustments,
    updateAdjustmentValue,
  } = useEditorAdjustmentActions();
  const { clearLayerMask, invertLayerMask, setLayerBlendMode, setLayerMaskMode, setLayerOpacity } =
    useEditorLayerActions();
  const { selectedLayer, selectedLayerAdjustmentVisibility } = useEditorSelectionState();
  const {
    activeToolPanelId,
    cropPreviewBypassed,
    cropGuideMode,
    cropGuideRotation,
    openSections,
    requestAutoPerspective,
    rotateCropGuide,
    setCropGuideMode,
    setActiveToolPanelId,
    toggleCropPreviewBypassed,
    toggleSection,
  } = useEditorViewState();

  const [layerChangesVisible, setLayerChangesVisible] = useState(true);

  const basicHasChanges = adjustments ? hasBasicChanges(adjustments) : false;
  const effectsHasChanges = adjustments ? hasEffectsChanges(adjustments) : false;
  const detailHasChanges = adjustments ? hasDetailChanges(adjustments) : false;
  const cropHasChanges = adjustments ? hasCropChanges(adjustments) : false;

  const resetBasicPanel = () => {
    updateAdjustments({
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
    });
  };

  const resetEffectsPanel = () => {
    updateAdjustments({
      texture: 0,
      clarity: 0,
      dehaze: 0,
      grain: 0,
      grainSize: 50,
      grainRoughness: 50,
      vignette: 0,
      glowIntensity: 0,
      glowMidtoneFocus: 50,
      glowBias: 25,
      glowRadius: 24,
    });
  };

  const resetDetailPanel = () => {
    updateAdjustments({
      sharpening: 0,
      sharpenRadius: 40,
      sharpenDetail: 25,
      masking: 0,
      noiseReduction: 0,
      colorNoiseReduction: 0,
    });
  };

  const resetCropPanel = () => {
    updateAdjustments({
      rotate: 0,
      rightAngleRotation: 0,
      perspectiveEnabled: false,
      perspectiveHorizontal: 0,
      perspectiveVertical: 0,
      horizontal: 0,
      vertical: 0,
      scale: 100,
      flipHorizontal: false,
      flipVertical: false,
      aspectRatio: "original",
      customAspectRatio: 4 / 3,
    });
  };

  const syncActiveToolPanel = (eventTarget: EventTarget | null) => {
    if (!(eventTarget instanceof Element)) {
      return;
    }
    const nextToolPanel = eventTarget.closest<HTMLElement>("[data-tool-panel]")?.dataset.toolPanel;
    if (
      (nextToolPanel === "edit" || nextToolPanel === "crop" || nextToolPanel === "mask") &&
      nextToolPanel !== activeToolPanelId
    ) {
      setActiveToolPanelId(nextToolPanel);
    }
  };

  const handleToggleCropSection = () => {
    toggleSection("crop");
    setActiveToolPanelId(openSections.crop ? "edit" : "crop");
  };

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col bg-[#121214] pl-5 md:w-[340px]",
        className
      )}
    >
      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        data-tool-panel="edit"
        onPointerDownCapture={(event) => syncActiveToolPanel(event.target)}
        onFocusCapture={(event) => syncActiveToolPanel(event.target)}
      >
        <EditorHistogramCard />

        <LayerPropertiesPanel
          layer={selectedLayer}
          isOpen={openSections.local}
          onToggle={() => toggleSection("local")}
          onSetOpacity={setLayerOpacity}
          onSetBlendMode={setLayerBlendMode}
          onSetMaskMode={setLayerMaskMode}
          onInvertMask={invertLayerMask}
          onClearMask={clearLayerMask}
          hasChanges={
            selectedLayer
              ? selectedLayer.opacity !== 100 || selectedLayer.blendMode !== "normal"
              : false
          }
          changesVisible={layerChangesVisible}
          onToggleVisibility={() => setLayerChangesVisible((prev) => !prev)}
          onResetChanges={() => {
            if (selectedLayer) {
              setLayerOpacity(selectedLayer.id, 100);
              setLayerBlendMode(selectedLayer.id, "normal");
            }
          }}
        />

        <EditorPresetCard />

        {adjustments && (
          <EditorCropSection
            adjustments={adjustments}
            cropGuideMode={cropGuideMode}
            cropGuideRotation={cropGuideRotation}
            isOpen={openSections.crop}
            onToggle={handleToggleCropSection}
            onSetCropGuideMode={setCropGuideMode}
            onRotateCropGuide={rotateCropGuide}
            onUpdateAdjustments={updateAdjustments}
            onPreviewAdjustmentValue={previewAdjustmentValue}
            onCommitAdjustmentValue={updateAdjustmentValue}
            onToggleFlip={toggleFlip}
            onRequestAutoPerspective={requestAutoPerspective}
            hasChanges={cropHasChanges}
            changesVisible={!cropPreviewBypassed}
            onToggleVisibility={toggleCropPreviewBypassed}
            onResetChanges={resetCropPanel}
          />
        )}

        {adjustments && (
          <BasicPanel
            adjustments={adjustments}
            isOpen={openSections.basic}
            onToggle={() => toggleSection("basic")}
            onUpdateAdjustments={updateAdjustments}
            onPreviewAdjustmentValue={previewAdjustmentValue}
            onCommitAdjustmentValue={updateAdjustmentValue}
            hasChanges={basicHasChanges}
            changesVisible={selectedLayerAdjustmentVisibility.basic}
            onToggleVisibility={() => toggleAdjustmentGroupVisibility("basic")}
            onResetChanges={resetBasicPanel}
          />
        )}

        {adjustments && (
          <EffectsPanel
            adjustments={adjustments}
            isOpen={openSections.effects}
            onToggle={() => toggleSection("effects")}
            onUpdateAdjustments={updateAdjustments}
            onPreviewAdjustmentValue={previewAdjustmentValue}
            onCommitAdjustmentValue={updateAdjustmentValue}
            hasChanges={effectsHasChanges}
            changesVisible={selectedLayerAdjustmentVisibility.effects}
            onToggleVisibility={() => toggleAdjustmentGroupVisibility("effects")}
            onResetChanges={resetEffectsPanel}
          />
        )}

        {adjustments && (
          <DetailPanel
            adjustments={adjustments}
            isOpen={openSections.detail}
            onToggle={() => toggleSection("detail")}
            onPreviewAdjustmentValue={previewAdjustmentValue}
            onCommitAdjustmentValue={updateAdjustmentValue}
            hasChanges={detailHasChanges}
            changesVisible={selectedLayerAdjustmentVisibility.detail}
            onToggleVisibility={() => toggleAdjustmentGroupVisibility("detail")}
            onResetChanges={resetDetailPanel}
          />
        )}

        <ExportPanel isOpen={openSections.export} onToggle={() => toggleSection("export")} />
      </div>
    </aside>
  );
}
