import { memo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { ExportPreviewItem, ExportTask, WorkspaceStep } from "@/features/workspace/types";
import { ExportPreviewGrid } from "./ExportPreviewGrid";

interface ExportSettingsCardProps {
  assets: { length: number };
  totalSize: number;
  format: "original" | "jpeg" | "png";
  setFormat: (value: "original" | "jpeg" | "png") => void;
  quality: number;
  setQuality: (value: number) => void;
  maxDimension: number;
  setMaxDimension: (value: number) => void;
  formatLabel: string;
  tasks: ExportTask[];
  completedCount: number;
  progress: number;
  exportPreviewItems: ExportPreviewItem[];
  setStep: (step: WorkspaceStep) => void;
}

export const ExportSettingsCard = memo(function ExportSettingsCard({
  assets,
  totalSize,
  format,
  setFormat,
  quality,
  setQuality,
  maxDimension,
  setMaxDimension,
  formatLabel,
  tasks,
  completedCount,
  progress,
  exportPreviewItems,
  setStep,
}: ExportSettingsCardProps) {
  const handleQualityChange = useCallback(
    (value: number[]) => setQuality(value[0] ?? 92),
    [setQuality]
  );

  return (
    <div className="space-y-6">
      <ExportPreviewGrid items={exportPreviewItems} />

      <Card className="animate-fade-up">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>导出设置</CardTitle>
          <div className="text-xs text-slate-400">
            可导出 {assets.length} 张 · 占用 {(totalSize / 1024 / 1024).toFixed(1)} MB
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">格式</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as "original" | "jpeg" | "png")}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择导出格式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">跟随原文件</SelectItem>
                <SelectItem value="jpeg">JPG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300">质量</span>
              <span>{quality}%</span>
            </div>
            <Slider
              value={[quality]}
              min={70}
              max={100}
              step={1}
              onValueChange={handleQualityChange}
            />
            <p className="mt-2 text-[11px] text-slate-500">PNG 忽略质量参数，JPG 建议 85% 以上。</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">最长边尺寸</Label>
            <Select
              value={String(maxDimension)}
              onValueChange={(value) => setMaxDimension(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择尺寸" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">不缩放</SelectItem>
                <SelectItem value="2048">2048 px</SelectItem>
                <SelectItem value="3072">3072 px</SelectItem>
                <SelectItem value="4096">4096 px</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
            当前配置：格式 {formatLabel} · 质量 {quality}% ·
            {maxDimension > 0 ? ` 最长边 ${maxDimension}px` : " 原始尺寸"}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>导出进度</CardTitle>
          <Badge>
            {completedCount}/{assets.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <span>完成率</span>
            <span>{progress}%</span>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/60">
            <div
              className="h-2 rounded-full bg-sky-300 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400">点击开始导出后显示进度。</p>
          ) : (
            <p className="text-xs text-slate-400">
              已完成 {completedCount} / {assets.length}
            </p>
          )}
          {progress === 100 && tasks.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setStep("library")}>
              回到素材库
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
