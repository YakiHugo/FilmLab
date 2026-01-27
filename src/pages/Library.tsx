import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useProjectStore } from "@/stores/projectStore";
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
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Image, Upload, Wand2 } from "lucide-react";

export function Library() {
  const {
    assets,
    addAssets,
    init,
    isLoading,
    resetProject,
    selectedAssetIds,
    setSelectedAssetIds,
    addToSelection,
    toggleAssetSelection,
    removeFromSelection,
    clearAssetSelection,
  } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    void init();
  }, [init]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const filtered = Array.from(files).filter((file) =>
        ["image/jpeg", "image/png"].includes(file.type)
      );
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

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>素材库</PageHeaderTitle>
          <PageHeaderDescription>导入照片并管理你的项目素材。</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            onClick={() => void resetProject()}
          >
            清空项目
          </Button>
          <Button className="w-full sm:w-auto" asChild>
            <Label className="flex w-full cursor-pointer items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              导入照片
              <Input
                type="file"
                multiple
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(event) => handleFiles(event.target.files)}
              />
            </Label>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>导入统计</CardTitle>
          <Badge>{assets.length} 张</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm text-slate-300">
          <div>总占用：{(totalSize / 1024 / 1024).toFixed(2)} MB</div>
          <div>状态：{isLoading ? "加载中" : "就绪"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>筛选与选择</CardTitle>
          <Badge>{selectedCount} 已选</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
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
              用筛选结果创建选择
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={clearAssetSelection}
              disabled={selectedCount === 0}
            >
              清空选择
            </Button>
            {selectedCount > 0 ? (
              <Button size="sm" asChild>
                <Link to="/batch">进入批处理（{selectedCount}）</Link>
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled>
                进入批处理
              </Button>
            )}
          </div>
          <div className="text-xs text-slate-400">
            当前筛选 {filteredAssets.length} 张，分页 {page}/{pageCount}
          </div>
        </CardContent>
      </Card>

      <div
        className={`flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
          isDragging ? "border-slate-200 bg-slate-900/80" : "border-slate-700"
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
        <Image className="mb-3 h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-300">拖拽 JPG/PNG 到此处导入</p>
        <p className="text-xs text-slate-500">自动生成缩略图与元信息</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pageAssets.map((asset) => {
          const isSelected = selectedSet.has(asset.id);
          return (
            <Card
              key={asset.id}
              className={`overflow-hidden ${isSelected ? "ring-2 ring-slate-300" : ""}`}
            >
              <div className="relative">
                <Link
                  to="/editor"
                  search={{ assetId: asset.id }}
                  className="block aspect-[4/3] overflow-hidden bg-slate-950"
                >
                  <img
                    src={asset.objectUrl}
                    alt={asset.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </Link>
                <label
                  className="absolute right-2 top-2 flex items-center gap-2 rounded-full bg-slate-950/80 px-2 py-1 text-xs text-slate-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleAssetSelection(asset.id)}
                    className="h-3 w-3 accent-slate-200"
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
  );
}
