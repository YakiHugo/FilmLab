import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Image, Upload, Wand2 } from "lucide-react";

export function Library() {
  const { assets, addAssets, init, isLoading, resetProject } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);

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
        {assets.map((asset) => (
          <Card key={asset.id} className="overflow-hidden">
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
            <CardContent className="space-y-2 text-xs text-slate-300">
              <div className="font-medium text-slate-100 line-clamp-1">
                {asset.name}
              </div>
              <div>分组：{asset.group}</div>
              <div>大小：{(asset.size / 1024).toFixed(1)} KB</div>
              <Button className="w-full" size="sm" variant="secondary" asChild>
                <Link to="/editor" search={{ assetId: asset.id }}>
                  <Wand2 className="h-4 w-4" />
                  进入精修
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
