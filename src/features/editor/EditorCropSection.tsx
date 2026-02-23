import { memo } from "react";
import { FlipHorizontal2, FlipVertical2, Lock, RotateCcw, RotateCw, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { EditingAdjustments } from "@/types";
import { EditorSection } from "./EditorSection";
import { EditorSliderRow } from "./EditorSliderRow";
import { CROP_SLIDERS } from "./editorPanelConfig";
import type { NumericAdjustmentKey } from "./types";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

interface CropRatioOption {
  id: string;
  label: string;
  aspectRatio?: EditingAdjustments["aspectRatio"];
  customRatio?: number;
}

type LockableCropRatioOption = CropRatioOption & {
  aspectRatio: Exclude<EditingAdjustments["aspectRatio"], "free" | "original">;
  customRatio: number;
};

const CROP_RATIO_OPTIONS: CropRatioOption[] = [
  { id: "original", label: "原始比例", aspectRatio: "original" },
  { id: "free", label: "自由比例", aspectRatio: "free" },
  { id: "1:1", label: "1:1", aspectRatio: "1:1", customRatio: 1 },
  { id: "2:1", label: "2:1", aspectRatio: "2:1", customRatio: 2 },
  { id: "1:2", label: "1:2", aspectRatio: "1:2", customRatio: 1 / 2 },
  { id: "3:2", label: "3:2", aspectRatio: "3:2", customRatio: 1.5 },
  { id: "2:3", label: "2:3", aspectRatio: "2:3", customRatio: 2 / 3 },
  { id: "4:3", label: "4:3", aspectRatio: "4:3", customRatio: 4 / 3 },
  { id: "3:4", label: "3:4", aspectRatio: "3:4", customRatio: 3 / 4 },
  { id: "5:4", label: "5:4", aspectRatio: "5:4", customRatio: 5 / 4 },
  { id: "4:5", label: "4:5", aspectRatio: "4:5", customRatio: 4 / 5 },
  { id: "7:5", label: "7:5", aspectRatio: "7:5", customRatio: 7 / 5 },
  { id: "5:7", label: "5:7", aspectRatio: "5:7", customRatio: 5 / 7 },
  { id: "11:8.5", label: "11:8.5", aspectRatio: "11:8.5", customRatio: 11 / 8.5 },
  { id: "8.5:11", label: "8.5:11", aspectRatio: "8.5:11", customRatio: 8.5 / 11 },
  { id: "16:9", label: "16:9", aspectRatio: "16:9", customRatio: 16 / 9 },
  { id: "9:16", label: "9:16", aspectRatio: "9:16", customRatio: 9 / 16 },
  { id: "16:10", label: "16:10", aspectRatio: "16:10", customRatio: 16 / 10 },
  { id: "10:16", label: "10:16", aspectRatio: "10:16", customRatio: 10 / 16 },
];

const LOCKABLE_CROP_RATIO_OPTIONS: LockableCropRatioOption[] = CROP_RATIO_OPTIONS.filter(
  (item): item is LockableCropRatioOption =>
    typeof item.customRatio === "number" &&
    Boolean(item.aspectRatio) &&
    item.aspectRatio !== "free" &&
    item.aspectRatio !== "original"
);

const isCloseRatio = (left: number, right: number) => Math.abs(left - right) <= 0.02;
const clampCropRatio = (value: number) => Math.min(2.5, Math.max(0.5, value));

const findClosestLockableCropRatioOption = (ratio: number) => {
  let closest: LockableCropRatioOption | null = null;
  let smallestDiff = Number.POSITIVE_INFINITY;
  for (const option of LOCKABLE_CROP_RATIO_OPTIONS) {
    const diff = Math.abs(option.customRatio - ratio);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = option;
    }
  }
  return closest;
};

const findAspectRatioOption = (aspectRatio: EditingAdjustments["aspectRatio"]) =>
  CROP_RATIO_OPTIONS.find((item) => item.aspectRatio === aspectRatio);

const buildSwappedCropRatioPatch = (
  adjustments: EditingAdjustments
): Partial<EditingAdjustments> => {
  if (adjustments.aspectRatio === "original" || adjustments.aspectRatio === "1:1") {
    return {} as Partial<EditingAdjustments>;
  }
  if (adjustments.aspectRatio === "free") {
    return {
      aspectRatio: "free" as const,
      customAspectRatio: clampCropRatio(1 / Math.max(adjustments.customAspectRatio, 0.01)),
    };
  }
  const [w, h] = adjustments.aspectRatio.split(":");
  if (!w || !h || w === h) {
    return {} as Partial<EditingAdjustments>;
  }
  const invertedAspectRatio = `${h}:${w}` as EditingAdjustments["aspectRatio"];
  const invertedOption = findAspectRatioOption(invertedAspectRatio);
  if (invertedOption?.aspectRatio) {
    return {
      aspectRatio: invertedOption.aspectRatio,
      customAspectRatio:
        typeof invertedOption.customRatio === "number"
          ? invertedOption.customRatio
          : adjustments.customAspectRatio,
    };
  }
  return {
    aspectRatio: "free",
    customAspectRatio: clampCropRatio(1 / Math.max(adjustments.customAspectRatio, 0.01)),
  };
};

const normalizeRotateAngle = (value: number) => {
  const clamped = Math.min(45, Math.max(-45, value));
  if (Math.abs(clamped) < 0.0001) {
    return 0;
  }
  return Number(clamped.toFixed(2));
};

const normalizeRightAngleRotation = (value: number) => {
  const quarterTurns = Math.round(value / 90);
  const normalizedTurns = ((quarterTurns % 4) + 4) % 4;
  return normalizedTurns * 90;
};

export const resolveCropRatioOptionId = (adjustments: EditingAdjustments) => {
  if (adjustments.aspectRatio === "original") {
    return "original";
  }
  if (adjustments.aspectRatio === "free") {
    const match = CROP_RATIO_OPTIONS.find((item) => {
      if (typeof item.customRatio !== "number") {
        return false;
      }
      return isCloseRatio(item.customRatio, adjustments.customAspectRatio);
    });
    return match?.id ?? "free";
  }
  const byAspect = CROP_RATIO_OPTIONS.find((item) => item.aspectRatio === adjustments.aspectRatio);
  return byAspect?.id ?? "free";
};

interface EditorCropSectionProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateAdjustments: (partial: Partial<EditingAdjustments>) => void;
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onToggleFlip: (axis: "flipHorizontal" | "flipVertical") => void;
}

export const EditorCropSection = memo(function EditorCropSection({
  adjustments,
  isOpen,
  onToggle,
  onUpdateAdjustments,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  onToggleFlip,
}: EditorCropSectionProps) {
  const ratioOptionId = resolveCropRatioOptionId(adjustments);
  const ratioLocked = adjustments.aspectRatio !== "free";
  const rotateSlider = CROP_SLIDERS.find((slider) => slider.key === "rotate");

  const applyCropRatioOption = (nextId: string) => {
    const option = CROP_RATIO_OPTIONS.find((item) => item.id === nextId);
    if (!option) {
      return;
    }
    if (option.aspectRatio) {
      onUpdateAdjustments({
        aspectRatio: option.aspectRatio,
        customAspectRatio:
          typeof option.customRatio === "number"
            ? option.customRatio
            : adjustments.customAspectRatio,
      });
      return;
    }
    if (typeof option.customRatio !== "number") {
      return;
    }
    onUpdateAdjustments({
      aspectRatio: "free",
      customAspectRatio: option.customRatio,
    });
  };

  const swapCropRatioOrientation = () => {
    const patch = buildSwappedCropRatioPatch(adjustments);
    if (Object.keys(patch).length === 0) {
      return;
    }
    onUpdateAdjustments(patch);
  };

  const toggleCropRatioLock = () => {
    if (ratioLocked) {
      onUpdateAdjustments({ aspectRatio: "free" });
      return;
    }
    const selected = CROP_RATIO_OPTIONS.find((item) => item.id === ratioOptionId);
    if (selected?.aspectRatio && selected.aspectRatio !== "free") {
      onUpdateAdjustments({
        aspectRatio: selected.aspectRatio,
        customAspectRatio:
          typeof selected.customRatio === "number"
            ? selected.customRatio
            : adjustments.customAspectRatio,
      });
      return;
    }
    const closest = findClosestLockableCropRatioOption(adjustments.customAspectRatio);
    if (closest?.aspectRatio) {
      onUpdateAdjustments({
        aspectRatio: closest.aspectRatio,
        customAspectRatio:
          typeof closest.customRatio === "number"
            ? closest.customRatio
            : adjustments.customAspectRatio,
      });
      return;
    }
    onUpdateAdjustments({ aspectRatio: "original" });
  };

  const resetCropSection = () => {
    onUpdateAdjustments({
      aspectRatio: DEFAULT_ADJUSTMENTS.aspectRatio,
      customAspectRatio: DEFAULT_ADJUSTMENTS.customAspectRatio,
      rotate: DEFAULT_ADJUSTMENTS.rotate,
      rightAngleRotation: DEFAULT_ADJUSTMENTS.rightAngleRotation,
      horizontal: DEFAULT_ADJUSTMENTS.horizontal,
      vertical: DEFAULT_ADJUSTMENTS.vertical,
      scale: DEFAULT_ADJUSTMENTS.scale,
      flipHorizontal: DEFAULT_ADJUSTMENTS.flipHorizontal,
      flipVertical: DEFAULT_ADJUSTMENTS.flipVertical,
    });
  };

  const rotateByRightAngle = (delta: number) => {
    const ratioPatch = buildSwappedCropRatioPatch(adjustments);
    onUpdateAdjustments({
      rightAngleRotation: normalizeRightAngleRotation(adjustments.rightAngleRotation + delta),
      ...ratioPatch,
    });
  };

  return (
    <EditorSection title="裁剪" hint="比例 / 拉直 / 旋转" isOpen={isOpen} onToggle={onToggle}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-300">画幅比例</p>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={resetCropSection}>
            重置
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={ratioOptionId} onValueChange={applyCropRatioOption}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="选择比例" />
            </SelectTrigger>
            <SelectContent>
              {CROP_RATIO_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 px-0"
            onClick={swapCropRatioOrientation}
            title="切换横竖方向"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={ratioLocked ? "default" : "secondary"}
            className="h-8 w-8 px-0"
            onClick={toggleCropRatioLock}
            title={ratioLocked ? "锁定比例" : "自由比例"}
          >
            {ratioLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {rotateSlider && (
        <EditorSliderRow
          label={rotateSlider.label}
          value={adjustments.rotate}
          defaultValue={DEFAULT_ADJUSTMENTS.rotate}
          min={rotateSlider.min}
          max={rotateSlider.max}
          step={rotateSlider.step}
          format={(value) => value.toFixed(2)}
          onChange={(value) => onPreviewAdjustmentValue("rotate", normalizeRotateAngle(value))}
          onCommit={(value) => onCommitAdjustmentValue("rotate", normalizeRotateAngle(value))}
          onReset={() => onCommitAdjustmentValue("rotate", DEFAULT_ADJUSTMENTS.rotate)}
        />
      )}

      <div className="space-y-2">
        <p className="text-xs text-slate-300">旋转与翻转</p>
        <div className="grid grid-cols-4 gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full px-0"
            onClick={() => rotateByRightAngle(90)}
            title="逆时针旋转 90°"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full px-0"
            onClick={() => rotateByRightAngle(-90)}
            title="顺时针旋转 90°"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={adjustments.flipHorizontal ? "default" : "secondary"}
            className="h-8 w-full px-0"
            onClick={() => onToggleFlip("flipHorizontal")}
            aria-pressed={adjustments.flipHorizontal}
            title="水平翻转"
          >
            <FlipHorizontal2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={adjustments.flipVertical ? "default" : "secondary"}
            className="h-8 w-full px-0"
            onClick={() => onToggleFlip("flipVertical")}
            aria-pressed={adjustments.flipVertical}
            title="垂直翻转"
          >
            <FlipVertical2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </EditorSection>
  );
});
