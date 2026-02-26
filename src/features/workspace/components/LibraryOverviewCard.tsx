import { memo } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface LibraryOverviewCardProps {
  filteredAssets: Asset[];
  selectedSet: Set<string>;
  activeAssetId: string | null;
  filteredSelectedCount: number;
  allFilteredSelected: boolean;
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

export const LibraryOverviewCard = memo(
  ({
    filteredAssets,
    selectedSet,
    activeAssetId,
    filteredSelectedCount,
    allFilteredSelected,
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
  }: LibraryOverviewCardProps) => {
    const selectedTagKeys = new Set(selectedTags.map(toTagKey));

    return (
      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <CardHeader>
          <CardTitle>素材一览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <Input
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="搜索文件名"
              aria-label="搜索素材"
            />
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
            <div className="flex items-center gap-2">
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
                disabled={filteredSelectedCount === 0}
              >
                清空选择
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDeleteSelection}
                disabled={filteredSelectedCount === 0 || isDeleting}
                className="text-rose-300 hover:text-rose-200"
              >
                {isDeleting ? "删除中..." : "删除已选"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300">标签筛选（OR）</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearTagFilter}
                disabled={selectedTags.length === 0}
              >
                清空标签
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tagOptions.length === 0 && <span className="text-xs text-slate-500">暂无标签</span>}
              {tagOptions.map((tag) => {
                const isActive = selectedTagKeys.has(toTagKey(tag));
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTagFilter(tag)}
                    className={cn(
                      "rounded-full border px-2 py-1 text-xs transition",
                      isActive
                        ? "border-sky-300/40 bg-sky-300/20 text-sky-100"
                        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Input
                value={tagInput}
                onChange={(event) => onTagInputChange(event.target.value)}
                placeholder="输入标签后，可对已选素材批量加标/删标"
                aria-label="标签输入"
              />
              <Button size="sm" variant="secondary" onClick={onApplyTagToSelection}>
                批量加标
              </Button>
              <Button size="sm" variant="ghost" onClick={onRemoveTagFromSelection}>
                批量删标
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            当前筛选已选 {filteredSelectedCount} / {filteredAssets.length}
          </div>

          {filteredAssets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
              还没有素材，导入后显示在这里。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.map((asset) => {
                const isSelected = selectedSet.has(asset.id);
                const isActive = asset.id === activeAssetId;
                const day = resolveAssetImportDay(asset);
                const tags = normalizeTags(asset.tags ?? []);
                return (
                  <div
                    key={asset.id}
                    className={cn(
                      "group cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 transition-all duration-200 hover:border-white/20 hover:shadow-lg hover:shadow-black/20",
                      isSelected && "ring-2 ring-sky-400/50",
                      isActive && "border-sky-200/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSetActiveAssetId(asset.id)}
                      className="block w-full overflow-hidden text-left"
                    >
                      <img
                        src={asset.thumbnailUrl ?? asset.objectUrl}
                        alt={asset.name}
                        className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    </button>
                    <div className="space-y-2 p-3 text-xs text-slate-300">
                      <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-[11px] text-slate-300">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleAssetSelection(asset.id)}
                            className="h-3 w-3 accent-sky-300"
                          />
                          选中
                        </label>
                        <Badge className="border-white/10 bg-white/5 text-slate-200">{day}</Badge>
                      </div>
                      <div className="flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-rose-300 hover:text-rose-200"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteAsset(asset.id);
                          }}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tags.length === 0 ? (
                          <span className="text-[11px] text-slate-500">无标签</span>
                        ) : (
                          tags.slice(0, 3).map((tag) => (
                            <span
                              key={`${asset.id}-${tag}`}
                              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                            >
                              #{tag}
                            </span>
                          ))
                        )}
                        {tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{tags.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

LibraryOverviewCard.displayName = "LibraryOverviewCard";
