import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";

interface ExportTask {
  id: string;
  name: string;
  status: "等待" | "完成";
}

export function ExportPage() {
  const { assets } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
    }))
  );
  const [tasks, setTasks] = useState<ExportTask[]>([]);

  const handleExportAll = () => {
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);

    newTasks.forEach((task, index) => {
      const asset = assets[index];
      if (!asset?.blob) return;
      const url = URL.createObjectURL(asset.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = asset.name;
      link.click();
      URL.revokeObjectURL(url);
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id ? { ...item, status: "完成" } : item
        )
      );
    });
  };

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets]
  );
  const completedCount = tasks.filter((task) => task.status === "完成").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

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
      hint: "原图占位",
    },
  ];

  return (
    <PageShell
      title="导出队列"
      kicker="Delivery"
      description="导出将以原图占位进行，本期重点验证交付流程。"
      actions={
        <Button
          className="w-full sm:w-auto"
          onClick={handleExportAll}
          disabled={assets.length === 0}
        >
          导出全部
        </Button>
      }
      stats={stats}
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>导出设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>格式</span>
              <span>JPG / PNG</span>
            </div>
            <div className="flex items-center justify-between">
              <span>质量</span>
              <span>默认</span>
            </div>
            <div className="flex items-center justify-between">
              <span>EXIF</span>
              <span>保留</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">说明</p>
              <p className="mt-2 text-xs text-slate-300">
                后续将接入离屏渲染队列与压缩策略。
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
                className="h-2 rounded-full bg-amber-300 transition-all"
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
                    : "border-amber-300/30 bg-amber-300/10 text-amber-200"
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
