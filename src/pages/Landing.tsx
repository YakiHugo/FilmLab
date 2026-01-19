import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Landing() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-10">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">FilmLab MVP</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">AI 胶片修图教练</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          导入一组照片，快速完成风格统一、批量应用与单张精修。该版本为 MVP 演示，提供预设、批处理与导出闭环。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/library">开始导入素材</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/batch">直接进入批处理</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>导入与资产</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            支持 JPG/PNG 导入，自动生成缩略图与元信息，本地 IndexedDB 持久化。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>批处理工作流</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            组内统一 preset、强度控制、推荐入口占位，1 分钟完成初步出片。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>单张精修</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            基于参数化滤镜栈，支持强度调整与回退。
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
