import { useState } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { hasAdjustmentGroupChanges } from "@/lib/editorAdjustmentVisibility";
import { cn } from "@/lib/utils";
import type { EditingAdjustments } from "@/types";
import { EditorCropSection } from "../EditorCropSection";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorPresetCard } from "../EditorPresetCard";
import {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorColorGradingActions,
  useEditorColorGradingState,
  useEditorLocalAdjustmentState,
  useEditorLayerActions,
  useEditorSelectionState,
  useEditorViewState,
} from "../useEditorSlices";
import { BasicPanel } from "../components/panels/BasicPanel";
import { ColorGradingPanel } from "../components/panels/ColorGradingPanel";
import { CurvePanel } from "../components/panels/CurvePanel";
import { DetailPanel } from "../components/panels/DetailPanel";
import { EffectsPanel } from "../components/panels/EffectsPanel";
import { ExportPanel } from "../components/panels/ExportPanel";
import { HslPanel } from "../components/panels/HslPanel";
import { LayerPropertiesPanel } from "../components/panels/LayerPropertiesPanel";
import { LocalAdjustmentsPanel } from "../components/panels/LocalAdjustmentsPanel";
import { OpticsPanel } from "../components/panels/OpticsPanel";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

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

const hasHslChanges = (adjustments: EditingAdjustments) =>
  Object.values(adjustments.hsl).some(
    (channel) =>
      channel.hue !== 0 || channel.saturation !== 0 || channel.luminance !== 0
  );

const hasCurveChanges = (adjustments: EditingAdjustments) =>
  adjustments.curveHighlights !== 0 ||
  adjustments.curveLights !== 0 ||
  adjustments.curveDarks !== 0 ||
  adjustments.curveShadows !== 0;

const hasColorGradingChanges = (adjustments: EditingAdjustments) => {
  const grading = adjustments.colorGrading;
  return (
    grading.blend !== DEFAULT_ADJUSTMENTS.colorGrading.blend ||
    grading.balance !== DEFAULT_ADJUSTMENTS.colorGrading.balance ||
    grading.shadows.hue !== 0 ||
    grading.shadows.saturation !== 0 ||
    grading.shadows.luminance !== 0 ||
    grading.midtones.hue !== 0 ||
    grading.midtones.saturation !== 0 ||
    grading.midtones.luminance !== 0 ||
    grading.highlights.hue !== 0 ||
    grading.highlights.saturation !== 0 ||
    grading.highlights.luminance !== 0
  );
};

const hasOpticsChanges = (adjustments: EditingAdjustments) =>
  adjustments.opticsProfile ||
  adjustments.opticsCA ||
  (adjustments.opticsDistortionK1 ?? 0) !== 0 ||
  (adjustments.opticsDistortionK2 ?? 0) !== 0 ||
  (adjustments.opticsCaAmount ?? 0) !== 0 ||
  adjustments.opticsVignette !== 0 ||
  (adjustments.opticsVignetteMidpoint ?? 50) !== 50;

const hasLocalChanges = (adjustments: EditingAdjustments) =>
  (adjustments.localAdjustments?.length ?? 0) > 0;

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const { adjustments, resolvedAdjustments } = useEditorAdjustmentState();
  const {
    addLocalAdjustment,
    duplicateLocalAdjustment,
    previewAdjustmentValue,
    previewLocalAdjustmentAmount,
    previewLocalAdjustmentDelta,
    removeLocalAdjustment,
    reorderLocalAdjustment,
    selectLocalAdjustment,
    setLocalAdjustmentEnabled,
    setLocalMaskMode,
    toggleAdjustmentGroupVisibility,
    toggleFlip,
    updateAdjustments,
    updateAdjustmentValue,
    updateLocalAdjustmentAmount,
    updateLocalAdjustmentDelta,
    updateLocalMask,
  } = useEditorAdjustmentActions();
  const {
    previewColorGradingValue,
    previewColorGradingZone,
    previewHslValue,
    resetColorGrading,
    setActiveHslColor,
    startPointColorPick,
    updateColorGradingValue,
    updateColorGradingZone,
    updateHslValue,
  } = useEditorColorGradingActions();
  const { activeHslColor, pointColorPicking } = useEditorColorGradingState();
  const { localAdjustments, selectedLocalAdjustment, selectedLocalAdjustmentId } =
    useEditorLocalAdjustmentState();
  const {
    clearLayerMask,
    invertLayerMask,
    setLayerBlendMode,
    setLayerMaskMode,
    setLayerOpacity,
  } = useEditorLayerActions();
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

  const basicHasChanges = adjustments ? hasAdjustmentGroupChanges(adjustments, "basic") : false;
  const effectsHasChanges = adjustments ? hasAdjustmentGroupChanges(adjustments, "effects") : false;
  const detailHasChanges = adjustments ? hasAdjustmentGroupChanges(adjustments, "detail") : false;
  const hslHasChanges = adjustments ? hasHslChanges(adjustments) : false;
  const curveHasChanges = adjustments ? hasCurveChanges(adjustments) : false;
  const gradingHasChanges = adjustments ? hasColorGradingChanges(adjustments) : false;
  const opticsHasChanges = adjustments ? hasOpticsChanges(adjustments) : false;
  const localHasChanges = adjustments ? hasLocalChanges(adjustments) : false;
  const basicHasVisibleChanges = resolvedAdjustments
    ? hasAdjustmentGroupChanges(resolvedAdjustments, "basic")
    : false;
  const effectsHasVisibleChanges = resolvedAdjustments
    ? hasAdjustmentGroupChanges(resolvedAdjustments, "effects")
    : false;
  const detailHasVisibleChanges = resolvedAdjustments
    ? hasAdjustmentGroupChanges(resolvedAdjustments, "detail")
    : false;
  const canToggleBasicVisibility =
    basicHasVisibleChanges || !selectedLayerAdjustmentVisibility.basic;
  const canToggleEffectsVisibility =
    effectsHasVisibleChanges || !selectedLayerAdjustmentVisibility.effects;
  const canToggleDetailVisibility =
    detailHasVisibleChanges || !selectedLayerAdjustmentVisibility.detail;
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
      temperatureKelvin: undefined,
      tintMG: undefined,
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

  const resetCurvePanel = () => {
    updateAdjustments({
      curveHighlights: 0,
      curveLights: 0,
      curveDarks: 0,
      curveShadows: 0,
    });
  };

  const resetHslPanel = () => {
    updateAdjustments({
      hsl: { ...DEFAULT_ADJUSTMENTS.hsl },
    });
  };

  const resetOpticsPanel = () => {
    updateAdjustments({
      opticsProfile: false,
      opticsCA: false,
      opticsDistortionK1: 0,
      opticsDistortionK2: 0,
      opticsCaAmount: 0,
      opticsVignette: 0,
      opticsVignetteMidpoint: 50,
    });
  };

  const resetLocalPanel = () => {
    updateAdjustments({
      localAdjustments: [],
    });
    selectLocalAdjustment(null);
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
          isOpen={openSections.layers}
          onToggle={() => toggleSection("layers")}
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

        {adjustments && (
          <>
            <BasicPanel
              adjustments={adjustments}
              isOpen={openSections.basic}
              onToggle={() => toggleSection("basic")}
              onUpdateAdjustments={updateAdjustments}
              onPreviewAdjustmentValue={previewAdjustmentValue}
              onCommitAdjustmentValue={updateAdjustmentValue}
              hasChanges={basicHasChanges}
              changesVisible={selectedLayerAdjustmentVisibility.basic}
              canToggleVisibility={canToggleBasicVisibility}
              canResetChanges={basicHasChanges}
              onToggleVisibility={() => toggleAdjustmentGroupVisibility("basic")}
              onResetChanges={resetBasicPanel}
            />

            <HslPanel
              adjustments={adjustments}
              activeColor={activeHslColor}
              pointColorPicking={pointColorPicking}
              isOpen={openSections.hsl}
              onToggle={() => toggleSection("hsl")}
              onSetActiveColor={setActiveHslColor}
              onStartPointColorPick={() => startPointColorPick("hsl")}
              onPreviewValue={previewHslValue}
              onCommitValue={updateHslValue}
              hasChanges={hslHasChanges}
              onResetChanges={resetHslPanel}
            />

            <CurvePanel
              adjustments={adjustments}
              isOpen={openSections.curve}
              onToggle={() => toggleSection("curve")}
              onPreviewAdjustmentValue={previewAdjustmentValue}
              onCommitAdjustmentValue={updateAdjustmentValue}
              hasChanges={curveHasChanges}
              onResetChanges={resetCurvePanel}
            />

            <ColorGradingPanel
              adjustments={adjustments}
              isOpen={openSections.grading}
              onToggle={() => toggleSection("grading")}
              onPreviewZone={previewColorGradingZone}
              onCommitZone={updateColorGradingZone}
              onPreviewValue={previewColorGradingValue}
              onCommitValue={updateColorGradingValue}
              hasChanges={gradingHasChanges}
              onResetChanges={resetColorGrading}
            />

            <EffectsPanel
              adjustments={adjustments}
              isOpen={openSections.effects}
              onToggle={() => toggleSection("effects")}
              onUpdateAdjustments={updateAdjustments}
              onPreviewAdjustmentValue={previewAdjustmentValue}
              onCommitAdjustmentValue={updateAdjustmentValue}
              hasChanges={effectsHasChanges}
              changesVisible={selectedLayerAdjustmentVisibility.effects}
              canToggleVisibility={canToggleEffectsVisibility}
              canResetChanges={effectsHasChanges}
              onToggleVisibility={() => toggleAdjustmentGroupVisibility("effects")}
              onResetChanges={resetEffectsPanel}
            />

            <DetailPanel
              adjustments={adjustments}
              isOpen={openSections.detail}
              onToggle={() => toggleSection("detail")}
              onPreviewAdjustmentValue={previewAdjustmentValue}
              onCommitAdjustmentValue={updateAdjustmentValue}
              hasChanges={detailHasChanges}
              changesVisible={selectedLayerAdjustmentVisibility.detail}
              canToggleVisibility={canToggleDetailVisibility}
              canResetChanges={detailHasChanges}
              onToggleVisibility={() => toggleAdjustmentGroupVisibility("detail")}
              onResetChanges={resetDetailPanel}
            />

            <OpticsPanel
              adjustments={adjustments}
              isOpen={openSections.optics}
              onToggle={() => toggleSection("optics")}
              onUpdateAdjustments={updateAdjustments}
              onPreviewAdjustmentValue={previewAdjustmentValue}
              onCommitAdjustmentValue={updateAdjustmentValue}
              hasChanges={opticsHasChanges}
              onResetChanges={resetOpticsPanel}
            />

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

            <LocalAdjustmentsPanel
              localAdjustments={localAdjustments}
              selectedLocalAdjustment={selectedLocalAdjustment}
              selectedLocalAdjustmentId={selectedLocalAdjustmentId}
              isOpen={openSections.local}
              onToggle={() => toggleSection("local")}
              onAddLocalAdjustment={addLocalAdjustment}
              onDuplicateLocalAdjustment={duplicateLocalAdjustment}
              onRemoveLocalAdjustment={removeLocalAdjustment}
              onSelectLocalAdjustment={selectLocalAdjustment}
              onReorderLocalAdjustment={reorderLocalAdjustment}
              onSetLocalAdjustmentEnabled={setLocalAdjustmentEnabled}
              onSetLocalMaskMode={setLocalMaskMode}
              onPreviewLocalAdjustmentAmount={previewLocalAdjustmentAmount}
              onCommitLocalAdjustmentAmount={updateLocalAdjustmentAmount}
              onPreviewLocalAdjustmentDelta={previewLocalAdjustmentDelta}
              onCommitLocalAdjustmentDelta={updateLocalAdjustmentDelta}
              onUpdateLocalMask={updateLocalMask}
              onActivateMaskTool={() => setActiveToolPanelId("mask")}
              hasChanges={localHasChanges}
              onResetChanges={resetLocalPanel}
            />
          </>
        )}

        <EditorPresetCard />
        <ExportPanel isOpen={openSections.export} onToggle={() => toggleSection("export")} />
      </div>
    </aside>
  );
}
