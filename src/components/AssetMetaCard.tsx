import type { Asset } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCameraLabel,
  formatCaptureTime,
  formatDimensions,
  formatExposureSummary,
} from "@/lib/assetMetadata";

interface AssetMetaCardProps {
  asset: Asset | null;
}

export function AssetMetaCard({ asset }: AssetMetaCardProps) {
  if (!asset) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>素材信息</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">请选择素材查看拍摄信息。</CardContent>
      </Card>
    );
  }

  const sizeMb = `${(asset.size / 1024 / 1024).toFixed(2)} MB`;
  const fileType = asset.type.split("/").pop()?.toUpperCase() ?? "未知";
  const lens = asset.metadata?.lensModel;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>素材信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">文件名</span>
          <span className="text-slate-100 line-clamp-1">{asset.name}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">格式/大小</span>
          <span>
            {fileType} · {sizeMb}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">尺寸</span>
          <span>{formatDimensions(asset.metadata)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">相机</span>
          <span className="line-clamp-1">{formatCameraLabel(asset.metadata)}</span>
        </div>
        {lens && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">镜头</span>
            <span className="line-clamp-1">{lens}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">参数</span>
          <span className="line-clamp-1">{formatExposureSummary(asset.metadata)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">拍摄时间</span>
          <span>{formatCaptureTime(asset.metadata)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
