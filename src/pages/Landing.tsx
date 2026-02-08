import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, Sparkles, Wand2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { UploadButton } from "@/components/UploadButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/PageShell";

export function Landing() {
  const { assets, selectedAssetIds } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      selectedAssetIds: state.selectedAssetIds,
    }))
  );

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets]
  );

  const stats = [
    { label: "素材数量", value: `${assets.length} 张`, hint: "已导入素材" },
    { label: "当前选择", value: `${selectedAssetIds.length} 张`, hint: "用于批处理" },
    {
      label: "本地占用",
      value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
      hint: "IndexedDB 缓存",
    },
  ];

  const workflow = [
    {
      title: "导入素材",
      description: "拖拽或批量导入 JPG/PNG，自动生成缩略图与元数据。",
      icon: Sparkles,
    },
    {
      title: "批处理统一",
      description: "按分组套用胶片预设，保持风格一致与节奏稳定。",
      icon: Layers,
    },
    {
      title: "单张精修",
      description: "进入精修面板微调参数，快速交付关键帧。",
      icon: Wand2,
    },
  ];

  return (
    <PageShell
      title={
        <>
          FilmLab <span className="text-gradient">胶片修图</span> 工作台
        </>
      }
      kicker="Mobile-first Workspace"
      description="从素材导入、分组批处理到单张精修与导出交付，移动端优先排布流程，桌面端保留控制面板。"
      actions={
        <>
          <UploadButton className="w-full sm:w-auto" label="导入素材" />
          <Button className="w-full sm:w-auto" variant="secondary" asChild>
            <Link to="/" search={{ step: "style" }}>
              进入批处理
            </Link>
          </Button>
        </>
      }
      stats={stats}
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>三步完成今日工作流</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workflow.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 animate-fade-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200/30 bg-sky-300/10 text-sky-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-sm text-slate-300">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <CardHeader>
            <CardTitle>项目节奏提示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                今日目标
              </p>
              <p className="mt-2 text-base text-white">完成 2 组素材的统一风格</p>
              <p className="text-xs text-slate-400">
                建议先在批处理面板锁定预设，再进入精修。
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                移动端提示
              </p>
              <p className="mt-2 text-base text-white">底部导航随时切换模块</p>
              <p className="text-xs text-slate-400">
                批处理与精修可横向滑动选择素材。
              </p>
            </div>
            <Button variant="ghost" className="w-full justify-between" asChild>
              <Link to="/" search={{ step: "library" }}>
                进入素材库准备导入
                <span className="text-xs text-slate-400">→</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "本地优先",
            description: "素材与参数保存在浏览器，本地处理更安心。",
          },
          {
            title: "风格一致",
            description: "预设 + 强度控制，保证整组照片调性统一。",
          },
          {
            title: "移动优先",
            description: "核心操作集中在拇指区域，单手也能顺畅推进。",
          },
        ].map((item, index) => (
          <Card
            key={item.title}
            className="animate-fade-up"
            style={{ animationDelay: `${160 + index * 80}ms` }}
          >
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              {item.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

