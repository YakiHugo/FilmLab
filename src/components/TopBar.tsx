import { Badge } from "@/components/ui/badge";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
      <div>
        <p className="text-sm text-slate-400">项目：</p>
        <h1 className="text-xl font-semibold text-white">胶片工作流演示项目</h1>
      </div>
      <div className="flex items-center gap-2">
        <Badge>本地处理</Badge>
        <Badge>AI 占位</Badge>
      </div>
    </header>
  );
}
