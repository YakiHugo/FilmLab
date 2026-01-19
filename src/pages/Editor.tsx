import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { presets } from "@/data/presets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function Editor() {
  const { assets, init, updateAsset } = useProjectStore();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!selectedAssetId && assets.length > 0) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, selectedAssetId]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>照片列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assets.length === 0 && (
            <p className="text-sm text-slate-400">暂无素材，请先导入照片。</p>
          )}
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => setSelectedAssetId(asset.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                asset.id === selectedAssetId
                  ? "border-slate-200 bg-slate-800"
                  : "border-slate-800 bg-slate-950 hover:bg-slate-900"
              }`}
            >
              <img
                src={asset.objectUrl}
                alt={asset.name}
                className="h-12 w-12 rounded-md object-cover"
              />
              <div className="text-xs text-slate-300">
                <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
                <p>Preset：{asset.presetId ?? "未设置"}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedAsset ? (
              <div className="space-y-4">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                  <img
                    src={selectedAsset.objectUrl}
                    alt={selectedAsset.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  当前预览为原图占位，实际滤镜渲染将在下一阶段接入。
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">请选择一张照片进行编辑。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>编辑参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAsset && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Preset</label>
                  <select
                    value={selectedAsset.presetId ?? presets[0]?.id}
                    onChange={(event) =>
                      updateAsset(selectedAsset.id, { presetId: event.target.value })
                    }
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  >
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">强度</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedAsset.intensity ?? 0}
                    onChange={(event) =>
                      updateAsset(selectedAsset.id, {
                        intensity: Number(event.target.value),
                      })
                    }
                    className="w-full"
                  />
                  <p className="text-xs text-slate-400">
                    当前：{selectedAsset.intensity ?? 0}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button>创建快照</Button>
                  <Button variant="secondary">撤销</Button>
                  <Button variant="secondary">重做</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
