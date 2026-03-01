import { memo, useEffect, useMemo, useRef, useState } from "react";
import { presets as basePresets } from "@/data/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { buildPresetDisplayLists } from "./presetListUtils";
import { useEditorState } from "./useEditorState";
import { EditorFilmProfilePicker } from "./EditorFilmProfilePicker";

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
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedPresetId = selectedAsset?.presetId;
  const canSaveCustomPreset = Boolean(previewAdjustments);
  const allPresets = useMemo(() => [...basePresets, ...customPresets], [customPresets]);
  const { aiRecommendations, sortedPresets } = useMemo(
    () => buildPresetDisplayLists(allPresets, selectedAsset?.aiRecommendation),
    [allPresets, selectedAsset?.aiRecommendation]
  );

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) {
      event.currentTarget.value = "";
      return;
    }
    void (async () => {
      const importedCount = await handleImportPresets(file);
      if (importedCount > 0) {
        setFeedback({ type: "success", text: `Imported ${importedCount} preset(s).` });
      } else {
        setFeedback({ type: "error", text: "Import failed or no valid presets found." });
      }
    })();
    event.currentTarget.value = "";
  };

  const handleImportFilmFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) {
      event.currentTarget.value = "";
      return;
    }
    void (async () => {
      const imported = await handleImportFilmProfile(file);
      setFeedback(
        imported
          ? { type: "success", text: "Film profile imported." }
          : { type: "error", text: "Film profile import failed. Please check the JSON file." }
      );
    })();
    event.currentTarget.value = "";
  };

  return (
    <Card className="bg-[#121316]">
      <CardHeader>
        <CardTitle>Presets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiRecommendations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-white/80">AI Recommended</p>
            <div className="grid gap-2">
              {aiRecommendations.map((preset, index) => (
                <Button
                  key={`${preset.id}-${index}`}
                  size="sm"
                  variant={selectedPresetId === preset.id ? "default" : "secondary"}
                  onClick={() => handleSelectPreset(preset.id)}
                  aria-pressed={selectedPresetId === preset.id}
                  disabled={!selectedAsset}
                  className="justify-between gap-2"
                  title={preset.reason}
                >
                  <span className="line-clamp-1">{preset.name}</span>
                  <span className="text-[10px] text-slate-300">Rank {index + 1}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">All Presets</p>
          <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
            {sortedPresets.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant={selectedPresetId === preset.id ? "default" : "secondary"}
                onClick={() => handleSelectPreset(preset.id)}
                aria-pressed={selectedPresetId === preset.id}
                disabled={!selectedAsset}
                className="justify-start"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Film Profile</Label>
          <EditorFilmProfilePicker
            profiles={builtInFilmProfiles}
            selectedProfileId={selectedAsset?.filmProfileId}
            disabled={!selectedAsset}
            onSelect={handleSelectFilmProfile}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f1114]/70 p-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="text-slate-300">Preset Intensity</span>
            <span>{selectedAsset?.intensity ?? 0}</span>
          </div>
          <Slider
            value={[selectedAsset?.intensity ?? 0]}
            min={0}
            max={100}
            step={1}
            onValueChange={(value) => handleSetIntensity(value[0] ?? 0, "live")}
            onValueCommit={(value) => handleSetIntensity(value[0] ?? 0, "commit")}
            disabled={!selectedAsset}
            aria-label="Preset Intensity"
          />
        </div>

        <details className="rounded-2xl border border-white/10 bg-[#0f1114]/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">Preset Management</summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Save Current as Custom Preset</Label>
              <Input
                value={customPresetName}
                onChange={(event) => setCustomPresetName(event.target.value)}
                placeholder="Enter preset name"
              />
              <Button
                className="w-full"
                onClick={() => {
                  const saved = handleSaveCustomPreset();
                  setFeedback(
                    saved
                      ? { type: "success", text: "Custom preset saved." }
                      : {
                          type: "error",
                          text: "Save failed. Ensure name is provided and adjustments are available.",
                        }
                  );
                }}
                disabled={!customPresetName.trim() || !canSaveCustomPreset}
              >
                Save Preset
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const exported = handleExportPresets();
                  setFeedback(
                    exported
                      ? { type: "success", text: "Presets exported as JSON." }
                      : { type: "error", text: "No custom presets available to export." }
                  );
                }}
                disabled={customPresets.length === 0}
              >
                Export JSON
              </Button>
              <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}>
                Import JSON
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
                onClick={() => {
                  const exported = handleExportFilmProfile();
                  setFeedback(
                    exported
                      ? { type: "success", text: "Film profile exported as JSON." }
                      : { type: "error", text: "No active film profile to export." }
                  );
                }}
                disabled={!selectedAsset}
              >
                Export Film Profile
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => filmImportRef.current?.click()}
                disabled={!selectedAsset}
              >
                Import Film Profile
              </Button>
              <input
                ref={filmImportRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportFilmFile}
              />
            </div>
          </div>
        </details>

        {feedback && (
          <p
            role="status"
            aria-live="polite"
            className={
              feedback.type === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"
            }
          >
            {feedback.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
});

