import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload, Wand2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/stores/projectStore";
import { UploadButton } from "@/components/UploadButton";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCameraLabel,
  formatDimensions,
  formatExposureSummary,
} from "@/lib/assetMetadata";

export function Library() {
  const {
    assets,
    addAssets,
    isLoading,
    resetProject,
    selectedAssetIds,
    setSelectedAssetIds,
    addToSelection,
    toggleAssetSelection,
    removeFromSelection,
    clearAssetSelection,
  } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      addAssets: state.addAssets,
      isLoading: state.isLoading,
      resetProject: state.resetProject,
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      addToSelection: state.addToSelection,
      toggleAssetSelection: state.toggleAssetSelection,
      removeFromSelection: state.removeFromSelection,
      clearAssetSelection: state.clearAssetSelection,
    }))
  );

  const [isDragging, setIsDragging] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const filtered = Array.from(files).filter((file) =>
        ["image/jpeg", "image/png"].includes(file.type)
      );
      if (filtered.length === 0) return;
      void addAssets(filtered);
    },
    [addAssets]
  );

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets]
  );
  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);

  const groupOptions = useMemo(() => {
    const groups = new Set<string>();
    assets.forEach((asset) => groups.add(asset.group ?? "未分组"));
    return Array.from(groups);
  }, [assets]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const group = asset.group ?? "未分组";
      if (selectedGroup !== "all" && group !== selectedGroup) {
        return false;
      }
      if (normalizedSearch && !asset.name.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [assets, normalizedSearch, selectedGroup]);

  const pageCount = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const pageAssets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [selectedGroup, normalizedSearch, pageSize]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedSet.has(asset.id)),
    [assets, selectedSet]
  );
  const selectedCount = selectedAssets.length;

  const stats = [
    {
      label: "素材总量",
      value: `${assets.length} 张`,
      hint: isLoading ? "同步中" : "就绪",
    },
    {
      label: "已选素材",
      value: `${selectedCount} 张`,
      hint: selectedCount > 0 ? "可进入批处理" : "暂无选择",
    },
    {
      label: "本地占用",
      value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
      hint: "IndexedDB 缓存",
    },
  ];

  return (
    <PageShell
      title="素材库"
      kicker="Library"
      description="移动端优先浏览素材，拖拽导入并快速筛选。"
      actions={
        <>
          <UploadButton className="w-full sm:w-auto" label="导入素材" />
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            onClick={() => void resetProject()}
          >
            清空项目
          </Button>
        </>
      }
      stats={stats}
    >
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>筛选与选择</CardTitle>
              <Badge className="border-white/10 bg-white/5 text-slate-200">
                {filteredAssets.length} 张
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="library-search" className="text-xs text-slate-400">
                  搜索素材
                </Label>
                <Input
                  id="library-search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="输入文件名关键词"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">按分组筛选</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
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
                  variant="secondary"
                  onClick={() => addToSelection(pageAssets.map((asset) => asset.id))}
                  disabled={pageAssets.length === 0}
                >
                  选择本页
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => removeFromSelection(pageAssets.map((asset) => asset.id))}
                  disabled={pageAssets.length === 0}
                >
                  取消本页
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSelectedAssetIds(filteredAssets.map((asset) => asset.id))}
                  disabled={filteredAssets.length === 0}
                >
                  用筛选结果选择
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={clearAssetSelection}
                  disabled={selectedCount === 0}
                >
                  清空选择
                </Button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span>当前已选</span>
                  <span className="text-white">{selectedCount} 张</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>筛选结果</span>
                  <span>{filteredAssets.length} 张</span>
                </div>
                {selectedCount > 0 ? (
                  <Button size="sm" className="mt-3 w-full" asChild>
                    <Link to="/batch">进入批处理</Link>
                  </Button>
                ) : (
                  <Button size="sm" className="mt-3 w-full" variant="secondary" disabled>
                    进入批处理
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div
            className={`flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-6 text-center transition animate-fade-up ${
              isDragging
                ? "border-sky-200/50 bg-sky-300/10"
                : "border-white/10 bg-slate-950/40"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sky-200">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-200">拖拽 JPG/PNG 到此处导入</p>
              <p className="text-xs text-slate-500">自动生成缩略图与元信息</p>
            </div>
            <UploadButton size="sm" variant="secondary" label="点此导入" />
          </div>

          {pageAssets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
              <p>还没有素材，拖拽或点击导入开始。</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pageAssets.map((asset, index) => {
                const isSelected = selectedSet.has(asset.id);
                return (
                  <Card
                    key={asset.id}
                    className={`overflow-hidden content-auto ${
                      isSelected ? "ring-2 ring-sky-200/40" : ""
                    }`}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="relative">
                      <Link
                        to="/editor"
                        search={{ assetId: asset.id }}
                        className="block aspect-[4/3] overflow-hidden bg-slate-950"
                      >
                        <img
                          src={asset.thumbnailUrl ?? asset.objectUrl}
                          alt={asset.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </Link>
                      <label
                        className="absolute right-2 top-2 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAssetSelection(asset.id)}
                          className="h-3 w-3 accent-sky-300"
                          aria-label={`选择 ${asset.name}`}
                        />
                        选中
                      </label>
                    </div>
                    <CardContent className="space-y-2 text-xs text-slate-300">
                      <div className="font-medium text-slate-100 line-clamp-1">
                        {asset.name}
                      </div>
                      <div>分组：{asset.group ?? "未分组"}</div>
                      <div>大小：{(asset.size / 1024).toFixed(1)} KB</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">
                        {formatCameraLabel(asset.metadata)}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">
                        {formatDimensions(asset.metadata)} ·{" "}
                        {formatExposureSummary(asset.metadata)}
                      </div>
                      <Button className="w-full" size="sm" variant="secondary" asChild>
                        <Link to="/editor" search={{ assetId: asset.id }}>
                          <Wand2 className="h-4 w-4" />
                          进入精修
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div>
              显示 {filteredAssets.length === 0 ? 0 : (page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, filteredAssets.length)} / {filteredAssets.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={page >= pageCount}
              >
                下一页
              </Button>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="每页数量" />
                </SelectTrigger>
                <SelectContent>
                  {[8, 12, 24].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      每页 {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 shadow-glow backdrop-blur md:hidden">
          <span>已选 {selectedCount} 张</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={clearAssetSelection}>
              清空
            </Button>
            <Button size="sm" asChild>
              <Link to="/batch">批处理</Link>
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

