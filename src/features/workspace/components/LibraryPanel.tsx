import { memo } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveAssetImportDay } from "@/stores/project/grouping";
import { normalizeTags } from "@/stores/project/tagging";
import { cn } from "@/lib/utils";
import type { Asset } from "@/types";

interface LibraryPanelProps {
  compact?: boolean;
  projectName: string;
  filteredAssets: Asset[];
  selectedSet: Set<string>;
  activeAssetId: string | null;
  selectedAssetCount: number;
  filteredSelectedCount: number;
  allFilteredSelected: boolean;
  totalSize: number;
  selectionNotice: string | null;
  searchText: string;
  selectedDay: string;
  dayOptions: string[];
  selectedTags: string[];
  tagOptions: string[];
  tagInput: string;
  onSearchTextChange: (value: string) => void;
  onSelectedDayChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onToggleTagFilter: (tag: string) => void;
  onClearTagFilter: () => void;
  onApplyTagToSelection: () => void;
  onRemoveTagFromSelection: () => void;
  isDeleting: boolean;
  onDeleteSelection: () => void;
  onDeleteAsset: (assetId: string) => void;
  onToggleAllFilteredAssets: () => void;
  onClearAssetSelection: () => void;
  onSetActiveAssetId: (assetId: string) => void;
  onToggleAssetSelection: (assetId: string) => void;
}

const toTagKey = (tag: string) => tag.toLocaleLowerCase();

export const LibraryPanel = memo(
  ({
    compact,
    projectName,
    filteredAssets,
    selectedSet,
    activeAssetId,
    selectedAssetCount,
    filteredSelectedCount,
    allFilteredSelected,
    totalSize,
    selectionNotice,
    searchText,
    selectedDay,
    dayOptions,
    selectedTags,
    tagOptions,
    tagInput,
    onSearchTextChange,
    onSelectedDayChange,
    onTagInputChange,
    onToggleTagFilter,
    onClearTagFilter,
    onApplyTagToSelection,
    onRemoveTagFromSelection,
    isDeleting,
    onDeleteSelection,
    onDeleteAsset,
    onToggleAllFilteredAssets,
    onClearAssetSelection,
    onSetActiveAssetId,
    onToggleAssetSelection,
  }: LibraryPanelProps) => {
    const searchInputId = compact ? "library-search-compact" : "library-search";
    const selectedTagKeys = new Set(selectedTags.map(toTagKey));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">素材库</p>
            <p className="text-sm text-white">{projectName}</p>
          </div>
          <Badge className="border-white/10 bg-white/5 text-slate-200">{filteredAssets.length}</Badge>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400" htmlFor={searchInputId}>
            搜索素材
          </Label>
          <Input
            id={searchInputId}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="输入文件名关键词"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400">按日期筛选</Label>
          <Select value={selectedDay} onValueChange={onSelectedDayChange}>
            <SelectTrigger>
              <SelectValue placeholder="全部日期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部日期</SelectItem>
              {dayOptions.map((day) => (
                <SelectItem key={day} value={day}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">标签筛选（OR）</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearTagFilter}
              disabled={selectedTags.length === 0}
            >
              清空
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tagOptions.length === 0 && <span className="text-xs text-slate-500">暂无标签</span>}
            {tagOptions.map((tag) => {
              const active = selectedTagKeys.has(toTagKey(tag));
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTagFilter(tag)}
                  className={cn(
                    "rounded-full border px-2 py-1 text-xs transition",
                    active
                      ? "border-sky-300/40 bg-sky-300/20 text-sky-100"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2">
            <Input
              value={tagInput}
              onChange={(event) => onTagInputChange(event.target.value)}
              placeholder="输入标签后批量加标或删标"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={onApplyTagToSelection}>
                批量加标
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={onRemoveTagFromSelection}>
                批量删标
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onToggleAllFilteredAssets}
            disabled={filteredAssets.length === 0}
          >
            {allFilteredSelected ? "取消全选" : "全选当前结果"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearAssetSelection}
            disabled={selectedAssetCount === 0}
          >
            清空选择
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDeleteSelection}
            disabled={selectedAssetCount === 0 || isDeleting}
            className="text-rose-300 hover:text-rose-200"
          >
            {isDeleting ? "删除中..." : "删除已选"}
          </Button>
        </div>

        <div className="space-y-2 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>当前筛选</span>
            <span className="text-white">
              {filteredSelectedCount} / {filteredAssets.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>本地占用</span>
            <span>{(totalSize / 1024 / 1024).toFixed(1)} MB</span>
          </div>
          <p
            className={cn("min-h-[16px] text-amber-300", !selectionNotice && "opacity-0")}
            role="status"
            aria-live="polite"
          >
            {selectionNotice ?? "占位"}
          </p>
        </div>

        <div
          className={cn(
            "space-y-2",
            compact ? "max-h-[45vh] overflow-y-auto" : "max-h-[50vh] overflow-y-auto"
          )}
        >
          {filteredAssets.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
              还没有素材，导入后显示在这里。
            </div>
          )}
          {filteredAssets.map((asset) => {
            const isSelected = selectedSet.has(asset.id);
            const isActive = asset.id === activeAssetId;
            const day = resolveAssetImportDay(asset);
            const tags = normalizeTags(asset.tags ?? []);

            return (
              <div
                key={asset.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-2 text-left transition",
                  isActive && "border-sky-200/40 bg-sky-300/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSetActiveAssetId(asset.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <img
                    src={asset.thumbnailUrl ?? asset.objectUrl}
                    alt={asset.name}
                    className="h-12 w-12 rounded-xl object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1 text-xs text-slate-300">
                    <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
                    <p>日期：{day}</p>
                    <p className="line-clamp-1">标签：{tags.length > 0 ? tags.map((tag) => `#${tag}`).join(" ") : "无"}</p>
                  </div>
                </button>
                <label
                  className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-200"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleAssetSelection(asset.id)}
                    className="h-3 w-3 accent-sky-300"
                    aria-label={`选择 ${asset.name}`}
                  />
                  选中
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-rose-300 hover:text-rose-200"
                  onClick={() => onDeleteAsset(asset.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

LibraryPanel.displayName = "LibraryPanel";
