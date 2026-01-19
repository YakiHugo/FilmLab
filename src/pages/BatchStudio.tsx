import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
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
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>AI 批处理面板</PageHeaderTitle>
          <PageHeaderDescription>
            基于分组快速统一风格，支持一键应用与强度调整。
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
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
        </PageHeaderActions>
      </PageHeader>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>当前推荐占位</CardTitle>
          <Badge>AI 推荐 V1 占位</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>{recommendation?.reason ?? "推荐逻辑尚未接入，本次演示使用手动选择 preset 与强度。"}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="w-full sm:w-[240px]">
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
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <span className="text-xs text-slate-400">强度 {intensity}</span>
              <Slider
                value={[intensity]}
                min={0}
                max={100}
                step={1}
                onValueChange={(value) => setIntensity(value[0] ?? 0)}
                className="sm:w-[200px]"
              />
            </div>
          </div>
          {recommendation && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Top3：</span>
              {recommendation.topPresets.map((preset) => (
                <Badge
                  key={preset.id}
                  className="border-slate-800 bg-slate-950 text-slate-200"
                >
                  {preset.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {groups.map(([groupName, groupAssets]) => (
          <Card key={groupName}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{groupName}</CardTitle>
              <Badge>{groupAssets.length} 张</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => applyPresetToGroup(groupName, selectedPreset, intensity)}
                >
                  应用到本组
                </Button>
                <Button className="w-full sm:w-auto" variant="secondary">
                  替换本组 preset
                </Button>
                <Button className="w-full sm:w-auto" variant="secondary">
                  强度统一调整
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
