import { memo, useRef } from "react";
import { presets as basePresets } from "@/data/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useEditorState } from "./useEditorState";

export const EditorPresetCard = memo(function EditorPresetCard() {
  const {
    selectedAsset,
    customPresets,
    builtInFilmProfiles,
    customPresetName,
    previewAdjustments,
    setCustomPresetName,
    handleSelectPreset,
    handleSelectFilmProfile,
    handleSetIntensity,
    handleSaveCustomPreset,
    handleExportPresets,
    handleImportPresets,
    handleExportFilmProfile,
    handleImportFilmProfile,
  } = useEditorState();

  const importRef = useRef<HTMLInputElement | null>(null);
  const filmImportRef = useRef<HTMLInputElement | null>(null);
  const selectedPresetId = selectedAsset?.presetId;
  const fallbackPresetId = basePresets[0]?.id;
  const canSaveCustomPreset = Boolean(previewAdjustments);

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    void handleImportPresets(file);
    event.currentTarget.value = "";
  };

  const handleImportFilmFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    void handleImportFilmProfile(file);
    event.currentTarget.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>预设系统</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">胶片档案</Label>
          <Select
            value={selectedAsset?.filmProfileId ?? "__auto__"}
            onValueChange={(value) =>
              handleSelectFilmProfile(value === "__auto__" ? undefined : value)
            }
            disabled={!selectedAsset}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择胶片档案" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">自动（跟随预设/运行时）</SelectItem>
              {builtInFilmProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">内置预设</p>
          <div className="grid gap-2">
            {basePresets.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant={
                  (selectedPresetId ?? fallbackPresetId) === preset.id
                    ? "default"
                    : "secondary"
                }
                onClick={() => handleSelectPreset(preset.id)}
                disabled={!selectedAsset}
                className="justify-start"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {customPresets.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">自定义预设</p>
            <div className="grid gap-2">
              {customPresets.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={selectedPresetId === preset.id ? "default" : "secondary"}
                  onClick={() => handleSelectPreset(preset.id)}
                  disabled={!selectedAsset}
                  className="justify-start"
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="text-slate-300">预设强度</span>
            <span>{selectedAsset?.intensity ?? 0}</span>
          </div>
          <Slider
            value={[selectedAsset?.intensity ?? 0]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => handleSetIntensity(value[0] ?? 0)}
            disabled={!selectedAsset}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400">保存为自定义预设</Label>
          <Input
            value={customPresetName}
            onChange={(event) => setCustomPresetName(event.target.value)}
            placeholder="请输入预设名称"
          />
          <Button
            className="w-full"
            onClick={handleSaveCustomPreset}
            disabled={!customPresetName.trim() || !canSaveCustomPreset}
          >
            保存预设
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportPresets}
            disabled={customPresets.length === 0}
          >
            导出 JSON
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => importRef.current?.click()}
          >
            导入 JSON
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportFilmProfile}
            disabled={!selectedAsset}
          >
            导出胶片档案
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => filmImportRef.current?.click()}
            disabled={!selectedAsset}
          >
            导入胶片档案
          </Button>
          <input
            ref={filmImportRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFilmFile}
          />
        </div>
      </CardContent>
    </Card>
  );
});
