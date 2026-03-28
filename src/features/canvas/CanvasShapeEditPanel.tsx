import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canvasDockBodyTextClassName,
  canvasDockFieldClassName,
  canvasDockFieldLabelClassName,
  canvasDockSectionClassName,
  canvasDockSelectContentClassName,
  canvasDockSelectTriggerClassName,
} from "./editDockTheme";
import type { CanvasShapeEditTarget } from "./editPanelSelection";
import { useCanvasShapeEditPanelModel } from "./hooks/useCanvasShapeEditPanelModel";

const formatNumberFieldValue = (value: number) =>
  `${Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}`;

const TextField = ({
  label,
  onCommit,
  value,
}: {
  label: string;
  onCommit: (value: string) => void;
  value: string;
}) => {
  const [draftValue, setDraftValue] = useState(value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitDraft = useCallback(() => {
    if (draftValue !== value) {
      onCommit(draftValue);
    }
  }, [draftValue, onCommit, value]);

  return (
    <label className="space-y-2">
      <span className={canvasDockFieldLabelClassName}>{label}</span>
      <Input
        type="text"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }

          commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }

          if (event.key === "Escape") {
            skipBlurCommitRef.current = true;
            setDraftValue(value);
            event.currentTarget.blur();
          }
        }}
        className={canvasDockFieldClassName}
      />
    </label>
  );
};

const NumberField = ({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) => {
  const [draftValue, setDraftValue] = useState(formatNumberFieldValue(value));
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraftValue(formatNumberFieldValue(value));
  }, [value]);

  const commitDraft = useCallback(() => {
    if (draftValue.trim().length === 0) {
      setDraftValue(formatNumberFieldValue(value));
      return;
    }

    const nextValue = Number(draftValue);
    if (!Number.isFinite(nextValue)) {
      setDraftValue(formatNumberFieldValue(value));
      return;
    }

    if (nextValue !== value) {
      onChange(nextValue);
    }
  }, [draftValue, onChange, value]);

  return (
    <label className="space-y-2">
      <span className={canvasDockFieldLabelClassName}>{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }

          commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }

          if (event.key === "Escape") {
            skipBlurCommitRef.current = true;
            setDraftValue(formatNumberFieldValue(value));
            event.currentTarget.blur();
          }
        }}
        className={canvasDockFieldClassName}
      />
    </label>
  );
};

interface CanvasShapeEditPanelProps {
  shape: CanvasShapeEditTarget | null;
}

export function CanvasShapeEditPanel({ shape }: CanvasShapeEditPanelProps) {
  const {
    setFill,
    setOpacity,
    setShapeFillGradientAngle,
    setShapeFillGradientFrom,
    setShapeFillGradientTo,
    setShapeFillMode,
    setStroke,
    setStrokeWidth,
    shapeFillStyle,
  } = useCanvasShapeEditPanelModel(shape);
  const supportsFillControls =
    shape?.shapeType === "rect" || shape?.shapeType === "ellipse";

  if (!shape || !shapeFillStyle) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            Select a shape on the canvas to start editing.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className={canvasDockSectionClassName}>
        <p className={canvasDockFieldLabelClassName}>Selected Shape</p>
        <p className="mt-2 text-sm font-medium text-[color:var(--canvas-edit-text)]">
          {shape.shapeType}
        </p>
      </div>

      <div className={canvasDockSectionClassName}>
        <p className={canvasDockFieldLabelClassName}>Fill</p>
        {supportsFillControls ? (
          <div className="mt-3 space-y-3">
            <Select
              value={shapeFillStyle.kind}
              onValueChange={(value) =>
                setShapeFillMode(value as "solid" | "linear-gradient")
              }
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue placeholder="Fill mode" />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="linear-gradient">Linear Gradient</SelectItem>
              </SelectContent>
            </Select>

            {shapeFillStyle.kind === "solid" ? (
              <TextField
                label="Color"
                value={shapeFillStyle.color}
                onCommit={setFill}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <TextField
                  label="From"
                  value={shapeFillStyle.from}
                  onCommit={setShapeFillGradientFrom}
                />
                <TextField
                  label="To"
                  value={shapeFillStyle.to}
                  onCommit={setShapeFillGradientTo}
                />
                <NumberField
                  label="Angle"
                  value={shapeFillStyle.angle}
                  step={1}
                  onChange={setShapeFillGradientAngle}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]">
            Fill controls currently apply to rectangles and ellipses only.
          </p>
        )}
      </div>

      <div className={canvasDockSectionClassName}>
        <p className={canvasDockFieldLabelClassName}>Stroke & Opacity</p>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <TextField
            label="Stroke"
            value={shape.stroke}
            onCommit={setStroke}
          />
          <NumberField
            label="Stroke Width"
            value={shape.strokeWidth}
            min={0}
            step={0.5}
            onChange={setStrokeWidth}
          />
          <NumberField
            label="Opacity"
            value={shape.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={setOpacity}
          />
        </div>
      </div>
    </section>
  );
}
