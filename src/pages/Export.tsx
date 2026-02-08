import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { resolveAdjustmentsWithPreset } from "@/lib/adjustments";
import { resolveFilmProfile as resolveRuntimeFilmProfile } from "@/lib/film";
import { renderImageToBlob } from "@/lib/imageProcessing";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExportTask {
  id: string;
  name: string;
  status: "等待" | "处理中" | "完成" | "失败";
}

export function ExportPage() {
  const { assets } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
    }))
  );
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [format, setFormat] = useState<"original" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(92);
  const [maxDimension, setMaxDimension] = useState(0);

  const resolveOutputType = (assetType: string) => {
    if (format === "png") {
      return "image/png";
    }
    if (format === "jpeg") {
      return "image/jpeg";
    }
    return assetType === "image/png" ? "image/png" : "image/jpeg";
  };

  const buildDownloadName = (name: string, type: string) => {
    const base = name.replace(/\.[^/.]+$/, "");
    const extension = type === "image/png" ? ".png" : ".jpg";
    if (format === "original") {
      return name;
    }
    return `${base}${extension}`;
  };

  const handleExportAll = async () => {
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);

    for (const asset of assets) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === asset.id ? { ...item, status: "处理中" } : item
        )
      );
      try {
        if (!asset?.blob) {
          throw new Error("缺少原图数据");
        }
        const adjustments = resolveAdjustmentsWithPreset(
          asset.adjustments,
          asset.presetId,
          asset.intensity
        );
        const filmProfile = resolveRuntimeFilmProfile({
          adjustments,
          presetId: asset.presetId,
          filmProfileId: asset.filmProfileId,
          filmProfile: asset.filmProfile,
          intensity: asset.intensity,
          overrides: asset.filmOverrides,
        });
        const outputType = resolveOutputType(asset.type);
        const blob = await renderImageToBlob(asset.blob, adjustments, {
          type: outputType,
          quality: quality / 100,
          maxDimension: maxDimension > 0 ? maxDimension : undefined,
          filmProfile,
          seedKey: asset.id,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = buildDownloadName(asset.name, outputType);
        link.click();
        URL.revokeObjectURL(url);
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "完成" } : item
          )
        );
      } catch (error) {
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "失败" } : item
          )
        );
      }
    }
  };

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets]
  );
  const completedCount = tasks.filter((task) => task.status === "完成").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const isExporting = tasks.some((task) => task.status === "处理中");

  const stats = [
    { label: "可导出素材", value: `${assets.length} 张`, hint: "当前项目" },
    {
      label: "导出进度",
      value: tasks.length === 0 ? "未开始" : `${completedCount}/${tasks.length}`,
      hint: tasks.length === 0 ? "点击导出全部" : `完成率 ${progress}%`,
    },
    {
      label: "估算体积",
      value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
      hint: "原图体积",
    },
  ];

  const formatLabel =
    format === "original"
      ? "跟随原文件"
      : format === "png"
        ? "PNG"
        : "JPG";

  return (
    <PageShell
      title="导出队列"
      kicker="导出交付"
      description="导出将应用当前调色参数，并生成可下载文件。"
      actions={
        <Button
          className="w-full sm:w-auto"
          onClick={handleExportAll}
          disabled={assets.length === 0 || isExporting}
        >
          {isExporting ? "导出中" : "导出全部"}
        </Button>
      }
      stats={stats}
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>导出设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">格式</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
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
                onValueChange={(value) => setQuality(value[0] ?? 92)}
              />
              <p className="mt-2 text-[11px] text-slate-500">
                PNG 忽略质量参数，JPG 建议 85% 以上。
              </p>
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
            <div className="flex items-center justify-between">
              <span>EXIF</span>
              <span>不保留</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                当前配置
              </p>
              <p className="mt-2 text-xs text-slate-300">
                格式 {formatLabel} · 质量 {quality}% ·{maxDimension > 0
                  ? ` 最长边 ${maxDimension}px`
                  : " 原始尺寸"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <CardHeader>
            <CardTitle>导出进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>任务数量</span>
              <span>{tasks.length || assets.length} 张</span>
            </div>
            <div className="flex items-center justify-between">
              <span>完成数量</span>
              <span>{completedCount} 张</span>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/60">
              <div
                className="h-2 rounded-full bg-sky-300 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">当前完成率 {progress}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>导出列表</CardTitle>
          <Badge>{tasks.length} 项</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-300">
          {tasks.length === 0 && (
            <p className="text-slate-400">暂无任务，导出后将显示列表。</p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="line-clamp-1 text-slate-100">{task.name}</span>
              <Badge
                className={
                  task.status === "完成"
                    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                    : task.status === "失败"
                      ? "border-rose-300/30 bg-rose-300/10 text-rose-200"
                      : task.status === "处理中"
                        ? "border-sky-300/30 bg-sky-300/10 text-sky-200"
                        : "border-sky-300/30 bg-sky-300/10 text-sky-200"
                }
              >
                {task.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
}

