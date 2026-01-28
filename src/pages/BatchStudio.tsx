import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PageShell } from "@/components/layout/PageShell";
import { presets } from "@/data/presets";

export function BatchStudio() {
  const {
    assets,
    applyPresetToGroup,
    updatePresetForGroup,
    updateIntensityForGroup,
    applyPresetToSelection,
    selectedAssetIds,
    clearAssetSelection,
  } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      applyPresetToGroup: state.applyPresetToGroup,
      updatePresetForGroup: state.updatePresetForGroup,
      updateIntensityForGroup: state.updateIntensityForGroup,
      applyPresetToSelection: state.applyPresetToSelection,
      selectedAssetIds: state.selectedAssetIds,
      clearAssetSelection: state.clearAssetSelection,
    }))
  );

  const [mode, setMode] = useState<"一致性优先" | "最适配优先">("一致性优先");
  const [selectedPreset, setSelectedPreset] = useState(presets[0]?.id ?? "");
  const [intensity, setIntensity] = useState(60);

  const { data: recommendation } = useQuery({
    queryKey: ["ai-recommendation", assets.length],
    queryFn: async () => ({
      topPresets: presets.slice(0, 3),
      reason: "基于场景分组与曝光占位推断，建议从前三个风格开始试验。",
    }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, typeof assets>();
    assets.forEach((asset) => {
      const group = asset.group ?? "默认分组";
      const list = map.get(group) ?? [];
      list.push(asset);
      map.set(group, list);
    });
    return Array.from(map.entries());
  }, [assets]);

  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedSet.has(asset.id)),
    [assets, selectedSet]
  );

  const stats = [
    { label: "素材总量", value: `${assets.length} 张`, hint: "可批处理" },
    { label: "已选素材", value: `${selectedAssets.length} 张`, hint: "用于预设" },
    { label: "分组数量", value: `${groups.length} 组`, hint: "按分组处理" },
  ];

  return (
    <PageShell
      title="批处理面板"
      kicker="Batch Studio"
      description="移动端优先处理分组风格，一键应用到选中素材。"
      actions={
        <>
          <Button className="w-full sm:w-auto" variant="secondary" asChild>
            <Link to="/library">返回素材库</Link>
          </Button>
          <Button className="w-full sm:w-auto" variant="ghost" asChild>
            <Link to="/export">查看导出</Link>
          </Button>
        </>
      }
      stats={stats}
    >
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>批处理控制</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full sm:w-auto"
                  variant={mode === "一致性优先" ? "default" : "secondary"}
                  onClick={() => setMode("一致性优先")}
                >
                  一致性优先
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  variant={mode === "最适配优先" ? "default" : "secondary"}
                  onClick={() => setMode("最适配优先")}
                >
                  最适配优先
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">选择预设</Label>
                <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择 preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="text-slate-300">强度</span>
                  <span>{intensity}</span>
                </div>
                <Slider
                  value={[intensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(value) => setIntensity(value[0] ?? 0)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>AI 推荐占位</CardTitle>
              <Badge>V1 占位</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <p>
                {recommendation?.reason ??
                  "推荐逻辑尚未接入，本次演示使用手动选择预设与强度。"}
              </p>
              {recommendation && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Top3：</span>
                  {recommendation.topPresets.map((preset) => (
                    <Badge
                      key={preset.id}
                      className="border-white/10 bg-slate-950/60 text-slate-200"
                    >
                      {preset.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-up" style={{ animationDelay: "160ms" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>临时选择</CardTitle>
              <Badge>{selectedAssets.length} 张</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              {selectedAssets.length === 0 ? (
                <div className="space-y-2">
                  <p>尚未选择素材，请先在素材库中筛选并勾选。</p>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/library">返回素材库</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Button
                      className="w-full"
                      onClick={() =>
                        applyPresetToSelection(
                          selectedAssetIds,
                          selectedPreset,
                          intensity
                        )
                      }
                    >
                      应用到已选素材
                    </Button>
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={clearAssetSelection}
                    >
                      清空临时选择
                    </Button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {selectedAssets.slice(0, 10).map((asset) => (
                      <div
                        key={asset.id}
                        className="flex min-w-[160px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                      >
                        <img
                          src={asset.thumbnailUrl ?? asset.objectUrl}
                          alt={asset.name}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                        <div className="text-xs text-slate-300">
                          <p className="font-medium text-slate-100 line-clamp-1">
                            {asset.name}
                          </p>
                          <p>分组：{asset.group ?? "未分组"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedAssets.length > 10 && (
                    <p className="text-xs text-slate-400">
                      还有 {selectedAssets.length - 10} 张素材已选中。
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {groups.map(([groupName, groupAssets], index) => (
            <Card
              key={groupName}
              className="animate-fade-up"
              style={{ animationDelay: `${80 + index * 60}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{groupName}</CardTitle>
                <Badge>{groupAssets.length} 张</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() =>
                      applyPresetToGroup(groupName, selectedPreset, intensity)
                    }
                  >
                    应用到本组
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="secondary"
                    onClick={() => updatePresetForGroup(groupName, selectedPreset)}
                  >
                    替换本组预设
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="secondary"
                    onClick={() => updateIntensityForGroup(groupName, intensity)}
                  >
                    强度统一调整
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groupAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 content-auto"
                    >
                      <img
                        src={asset.thumbnailUrl ?? asset.objectUrl}
                        alt={asset.name}
                        className="h-14 w-14 rounded-xl object-cover"
                      />
                      <div className="text-xs text-slate-300">
                        <p className="font-medium text-slate-100 line-clamp-1">
                          {asset.name}
                        </p>
                        <p>Preset：{asset.presetId ?? "未设置"}</p>
                        <p>强度：{asset.intensity ?? 0}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
