import { Link, useMatchRoute } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { navItems } from "@/data/navigation";
import { useProjectStore } from "@/stores/projectStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DesktopNavProps {
  className?: string;
}

export function DesktopNav({ className }: DesktopNavProps) {
  const matchRoute = useMatchRoute();
  const { assets, selectedAssetIds } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      selectedAssetIds: state.selectedAssetIds,
    }))
  );

  return (
    <aside
      className={cn(
        "hidden h-full w-64 flex-col gap-6 border-r border-white/5 bg-slate-950/70 px-5 py-6 backdrop-blur md:flex md:sticky md:top-0 md:h-screen",
        className
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-300/10 text-sky-200">
            FL
          </div>
          <div>
            <p className="font-display text-lg text-white">FilmLab</p>
            <p className="text-xs text-slate-400">移动优先工作流</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          从素材导入到风格统一与交付，保持节奏和一致性。
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const isActive = Boolean(matchRoute({ to: item.to, fuzzy: false }));
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm text-slate-300 transition",
                "hover:border-white/10 hover:bg-white/5 hover:text-white",
                isActive &&
                  "border-white/10 bg-white/10 text-white shadow-[0_12px_24px_-16px_rgba(0,0,0,0.9)]"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200",
                  isActive && "border-sky-200/30 bg-sky-300/15 text-sky-200"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium leading-tight">{item.label}</p>
                <p className="text-[11px] text-slate-400">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          <p className="mb-2 text-sm font-semibold text-white">项目统计</p>
          <div className="flex items-center justify-between">
            <span>素材数量</span>
            <Badge className="border-white/10 bg-white/5 text-slate-200">
              {assets.length}
            </Badge>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span>已选素材</span>
            <Badge className="border-white/10 bg-white/5 text-slate-200">
              {selectedAssetIds.length}
            </Badge>
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          FilmLab MVP · 2026
        </div>
      </div>
    </aside>
  );
}

