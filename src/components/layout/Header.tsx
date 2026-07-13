import { Link, useLocation } from "@tanstack/react-router";
import { Film, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "\u5de5\u4f5c\u53f0", to: "/" as const, matches: ["/", "/canvas"] },
  { label: "\u7d20\u6750\u5e93", to: "/library" as const, matches: ["/library"] },
];

function ContextActions() {
  const pathname = useLocation({ select: (state) => state.pathname });

  if (pathname === "/") {
    return (
      <Link
        to="/assist"
        className="inline-flex items-center gap-1.5 border border-[#d9ff43]/35 bg-[#d9ff43]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d9ff43] transition hover:bg-[#d9ff43]/[0.12]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI 输入
      </Link>
    );
  }

  if (pathname === "/library" || pathname === "/assist") {
    return (
      <Link
        to="/"
        className="rounded-sm border border-white/10 bg-black/35 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
      >
        {`\u8fd4\u56de\u5de5\u4f5c\u53f0`}
      </Link>
    );
  }

  return null;
}

export function Header() {
  const pathname = useLocation({ select: (state) => state.pathname });

  const activeTab = useMemo(() => {
    if (pathname === "/assist") {
      return null;
    }
    return (
      NAV_ITEMS.find((item) =>
        item.matches.some((match) =>
          match === "/" ? pathname === "/" : pathname.startsWith(match)
        )
      )?.label ?? "\u5de5\u4f5c\u53f0"
    );
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 bg-[#121214]/80 backdrop-blur-xl">
      <div className="mx-auto grid h-11 w-full max-w-[1600px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 lg:px-5">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Link
            to="/"
            className="flex h-7 w-7 items-center justify-center text-zinc-100 transition-colors hover:text-zinc-50"
          >
            <Film className="h-3.5 w-3.5" />
          </Link>
          <p className="truncate text-xs font-semibold tracking-wide text-zinc-200">
            FilmLab / Compute
          </p>
        </div>

        <nav className="hidden items-center gap-0.5 rounded-sm border border-white/10 bg-black/35 p-0.5 justify-self-center md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "rounded-sm border border-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 transition focus-visible:border-[#d9ff43]/60 focus-visible:ring-0",
                  isActive && "border-[#d9ff43]/60 bg-[#d9ff43]/10 text-zinc-100",
                  !isActive && "hover:bg-white/10"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end">
          <ContextActions />
        </div>
      </div>
    </header>
  );
}
