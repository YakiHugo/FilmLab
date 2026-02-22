import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExportPreviewItem, ExportPreviewStatus } from "../types";

interface ExportPreviewGridProps {
  items: ExportPreviewItem[];
}

const STATUS_LABELS: Record<ExportPreviewStatus, string> = {
  未开始: "未开始",
  等待: "等待",
  处理中: "处理中",
  完成: "完成",
  失败: "失败",
};

const STATUS_CLASSES: Record<ExportPreviewStatus, string> = {
  未开始: "border-white/20 bg-white/10 text-slate-200",
  等待: "border-slate-300/30 bg-slate-300/15 text-slate-100",
  处理中: "border-sky-200/40 bg-sky-300/15 text-sky-100",
  完成: "border-emerald-200/40 bg-emerald-300/15 text-emerald-100",
  失败: "border-rose-200/40 bg-rose-300/15 text-rose-100",
};

const Thumbnail = memo(function Thumbnail({
  name,
  thumbnailUrl,
}: {
  name: string;
  thumbnailUrl?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (!thumbnailUrl || loadFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-900/70 text-[11px] text-slate-400">
        无预览
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={name}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setLoadFailed(true)}
    />
  );
});

export const ExportPreviewGrid = memo(function ExportPreviewGrid({
  items,
}: ExportPreviewGridProps) {
  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>导出预览</CardTitle>
        <Badge className="border-white/10 bg-white/5 text-slate-200">
          {items.length} 张
        </Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
            暂无可导出素材。
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-4">
            {items.map((item) => (
              <div
                key={item.assetId}
                className={cn(
                  "relative w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 md:w-auto",
                  item.isActive && "border-sky-200/40 ring-1 ring-sky-300/20",
                )}
              >
                <div className="relative h-20 w-full overflow-hidden bg-slate-900/60 md:h-24">
                  <Thumbnail
                    name={item.name}
                    thumbnailUrl={item.thumbnailUrl}
                  />
                  <span
                    className={cn(
                      "absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      STATUS_CLASSES[item.status],
                    )}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-xs text-slate-200">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
