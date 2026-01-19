import { useEffect, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ExportTask {
  id: string;
  name: string;
  status: "等待" | "完成";
}

export function ExportPage() {
  const { assets, init } = useProjectStore();
  const [tasks, setTasks] = useState<ExportTask[]>([]);

  useEffect(() => {
    void init();
  }, [init]);

  const handleExportAll = () => {
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);

    newTasks.forEach((task, index) => {
      const asset = assets[index];
      if (!asset?.blob) return;
      const url = URL.createObjectURL(asset.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = asset.name;
      link.click();
      URL.revokeObjectURL(url);
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id ? { ...item, status: "完成" } : item
        )
      );
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">导出</h2>
        <p className="text-sm text-slate-400">当前导出为原图占位，后续接入离屏渲染队列。</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>导出设置</CardTitle>
          <Button onClick={handleExportAll} disabled={assets.length === 0}>
            导出全部
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-300">
          <p>格式：JPG / PNG</p>
          <p>质量：默认</p>
          <p>EXIF：保留</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>导出队列</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-300">
          {tasks.length === 0 && <p>暂无任务。</p>}
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <span>{task.name}</span>
              <span>{task.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
