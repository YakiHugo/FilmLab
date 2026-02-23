import { memo } from "react";
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
import { cn } from "@/lib/utils";
import type { Asset } from "@/types";

interface LibraryOverviewCardProps {
  filteredAssets: Asset[];
  selectedSet: Set<string>;
  activeAssetId: string | null;
  filteredSelectedCount: number;
  allFilteredSelected: boolean;
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

export const LibraryOverviewCard = memo(
  ({
    filteredAssets,
    selectedSet,
    activeAssetId,
    filteredSelectedCount,
    allFilteredSelected,
    searchText,
    selectedGroup,
    groupOptions,
    onSearchTextChange,
    onSelectedGroupChange,
    onToggleAllFilteredAssets,
    onClearAssetSelection,
    onSetActiveAssetId,
    onToggleAssetSelection,
  }: LibraryOverviewCardProps) => (
    <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>素材一览</CardTitle>
        <Badge className="border-white/10 bg-white/5 text-slate-200">
          {filteredAssets.length} 张
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="搜索文件名"
            aria-label="搜索素材"
          />
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
          <div className="flex items-center gap-2">
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
              disabled={filteredSelectedCount === 0}
            >
              清空选择
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
              return (
                <div
                  key={asset.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60",
                    isSelected && "ring-2 ring-sky-200/40",
                    isActive && "border-sky-200/40"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSetActiveAssetId(asset.id)}
                    className="block w-full text-left"
                  >
                    <img
                      src={asset.thumbnailUrl ?? asset.objectUrl}
                      alt={asset.name}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                  <div className="space-y-2 p-3 text-xs text-slate-300">
                    <p className="font-medium text-slate-100 line-clamp-1">{asset.name}</p>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleAssetSelection(asset.id)}
                          className="h-3 w-3 accent-sky-300"
                        />
                        选中
                      </label>
                      <Badge className="border-white/10 bg-white/5 text-slate-200">
                        {asset.group ?? "未分组"}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
);

LibraryOverviewCard.displayName = "LibraryOverviewCard";
