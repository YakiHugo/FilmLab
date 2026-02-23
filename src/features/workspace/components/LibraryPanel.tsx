import { memo } from "react";
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
  selectedGroup: string;
  groupOptions: string[];
  onSearchTextChange: (value: string) => void;
  onSelectedGroupChange: (value: string) => void;
  onToggleAllFilteredAssets: () => void;
  onClearAssetSelection: () => void;
  onSetActiveAssetId: (assetId: string) => void;
  onToggleAssetSelection: (assetId: string) => void;
}

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
    selectedGroup,
    groupOptions,
    onSearchTextChange,
    onSelectedGroupChange,
    onToggleAllFilteredAssets,
    onClearAssetSelection,
    onSetActiveAssetId,
    onToggleAssetSelection,
  }: LibraryPanelProps) => {
    const searchInputId = compact ? "library-search-compact" : "library-search";
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">素材库</p>
            <p className="text-sm text-white">{projectName}</p>
          </div>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            {filteredAssets.length}
          </Badge>
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
          <Label className="text-xs text-slate-400">按分组筛选</Label>
          <Select value={selectedGroup} onValueChange={onSelectedGroupChange}>
            <SelectTrigger>
              <SelectValue placeholder="全部分组" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分组</SelectItem>
              {groupOptions.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onToggleAllFilteredAssets}
            disabled={filteredAssets.length === 0}
          >
            {allFilteredSelected ? "取消全选" : "全选当前结果"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onClearAssetSelection}
            disabled={selectedAssetCount === 0}
          >
            清空选择
          </Button>
        </div>
        <div className="space-y-2 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>已选素材</span>
            <span className="text-white">{selectedAssetCount} 张</span>
          </div>
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
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSetActiveAssetId(asset.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-2 text-left transition",
                  isActive && "border-sky-200/40 bg-sky-300/10"
                )}
              >
                <img
                  src={asset.thumbnailUrl ?? asset.objectUrl}
                  alt={asset.name}
                  className="h-12 w-12 rounded-xl object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1 text-xs text-slate-300">
                  <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
                  <p>分组：{asset.group ?? "未分组"}</p>
                </div>
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
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

LibraryPanel.displayName = "LibraryPanel";
