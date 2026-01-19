import { Badge } from "@/components/ui/badge";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
      <div className="space-y-1">
        <p className="text-sm text-slate-400">项目：</p>
        <h1 className="text-lg font-semibold text-white md:text-xl">胶片工作流演示项目</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>本地处理</Badge>
        <Badge>AI 占位</Badge>
      </div>
    </header>
  );
}
