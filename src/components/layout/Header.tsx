import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { CirclePlus, Film, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useOptionalCanvasWorkbenchTransitionGuard } from "@/features/canvas/canvasWorkbenchTransitionGuard";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectLoadedWorkbenchName } from "@/features/canvas/store/canvasStoreSelectors";

const NAV_ITEMS = [
  { label: "\u5de5\u4f5c\u53f0", to: "/" as const, matches: ["/", "/canvas"] },
  { label: "\u7d20\u6750\u5e93", to: "/library" as const, matches: ["/library"] },
];

const controlClass =
  "h-7 rounded-sm border border-white/10 bg-black/45 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0";

function ContextActions() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (state) => state.pathname });
  const activeWorkbenchName = useCanvasStore(selectLoadedWorkbenchName);
  const runBeforeWorkbenchTransition = useOptionalCanvasWorkbenchTransitionGuard();

  if (pathname === "/" || pathname.startsWith("/canvas")) {
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[220px] truncate rounded-sm border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-zinc-300">
          {activeWorkbenchName}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={controlClass}
          onClick={() => {
            void (async () => {
              await runBeforeWorkbenchTransition();
              const created = await useCanvasStore.getState().createWorkbench(undefined, {
                openAfterCreate: false,
              });
              if (!created) {
                return;
              }
              await navigate({
                to: "/canvas/$workbenchId",
                params: { workbenchId: created.id },
              });
            })();
          }}
        >
          <CirclePlus className="h-3.5 w-3.5" />
          {`\u65b0\u5efa\u5de5\u4f5c\u53f0`}
        </Button>
      </div>
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

  return (
    <Link
      to="/assist"
      className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-black/35 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
    >
      <Sparkles className="h-3.5 w-3.5" />
      AI Assist
    </Link>
  );
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
            FilmLab Canvas
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
                  "rounded-sm border border-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 transition focus-visible:border-yellow-500/60 focus-visible:ring-0",
                  isActive && "border-yellow-500/60 bg-yellow-500/10 text-zinc-100",
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
