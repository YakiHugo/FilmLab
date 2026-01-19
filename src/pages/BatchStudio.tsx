import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { presets } from "@/data/presets";

export function BatchStudio() {
  const { assets, init, applyPresetToGroup } = useProjectStore();
  const [mode, setMode] = useState<"一致性优先" | "最适配优先">("一致性优先");
  const [selectedPreset, setSelectedPreset] = useState(presets[0]?.id ?? "");
  const [intensity, setIntensity] = useState(60);

  useEffect(() => {
    void init();
  }, [init]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">AI 批处理面板</h2>
          <p className="text-sm text-slate-400">基于分组快速统一风格，支持一键应用与强度调整。</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === "一致性优先" ? "default" : "secondary"}
            onClick={() => setMode("一致性优先")}
          >
            一致性优先
          </Button>
          <Button
            variant={mode === "最适配优先" ? "default" : "secondary"}
            onClick={() => setMode("最适配优先")}
          >
            最适配优先
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>当前推荐占位</CardTitle>
          <Badge>AI 推荐 V1 占位</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>{recommendation?.reason ?? "推荐逻辑尚未接入，本次演示使用手动选择 preset 与强度。"}</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedPreset}
              onChange={(event) => setSelectedPreset(event.target.value)}
              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">强度 {intensity}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </div>
          </div>
          {recommendation && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Top3：</span>
              {recommendation.topPresets.map((preset) => (
                <span key={preset.id} className="rounded-md border border-slate-800 px-2 py-1">
                  {preset.name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {groups.map(([groupName, groupAssets]) => (
          <Card key={groupName}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{groupName}</CardTitle>
              <Badge>{groupAssets.length} 张</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => applyPresetToGroup(groupName, selectedPreset, intensity)}
                >
                  应用到本组
                </Button>
                <Button variant="secondary">替换本组 preset</Button>
                <Button variant="secondary">强度统一调整</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {groupAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <img
                      src={asset.objectUrl}
                      alt={asset.name}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <div className="text-xs text-slate-300">
                      <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
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
  );
}
