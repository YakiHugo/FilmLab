import { NavLink } from "react-router-dom";
import { Film, Image, LayoutGrid, Settings, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const navItems = [
  { to: "/", label: "首页", icon: Film },
  { to: "/library", label: "素材库", icon: Image },
  { to: "/batch", label: "批处理", icon: LayoutGrid },
  { to: "/editor", label: "精修", icon: Wand2 },
  { to: "/export", label: "导出", icon: Settings },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r border-slate-800 bg-slate-900/40 p-4 md:w-60",
        className
      )}
    >
      <div className="mb-6">
        <p className="text-lg font-semibold text-white">FilmLab</p>
        <p className="text-xs text-slate-400">AI 胶片修图教练 · MVP</p>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.to}
              asChild
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start gap-2 px-3 py-2 text-sm text-slate-200"
            >
              <NavLink
                to={item.to}
                className={({ isActive }) => cn(isActive && "bg-slate-800 text-white")}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            </Button>
          );
        })}
      </nav>
      <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
        当前版本：MVP Demo
      </div>
    </aside>
  );
}
