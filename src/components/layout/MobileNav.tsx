import { Link, useMatchRoute } from "@tanstack/react-router";
import { navItems } from "@/data/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const matchRoute = useMatchRoute();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {navItems.map((item) => {
          const isActive = Boolean(matchRoute({ to: item.to, fuzzy: false }));
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium text-slate-300 transition",
                isActive && "bg-white/10 text-white"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200",
                  isActive && "border-amber-200/30 bg-amber-300/20 text-amber-200"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="leading-none">{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
