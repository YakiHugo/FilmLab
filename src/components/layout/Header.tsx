import { Link, useLocation } from "@tanstack/react-router";
import { CirclePlus, Film, MessageSquarePlus } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { useChatStore } from "@/stores/chatStore";

const NAV_ITEMS = [
  { label: "Library", to: "/library" as const, matches: ["/library", "/editor"] },
  { label: "Chat", to: "/" as const, matches: ["/"] },
  { label: "Canvas", to: "/canvas" as const, matches: ["/canvas"] },
];
const controlClass =
  "h-7 rounded-sm border border-white/10 bg-black/45 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0";

function ContextActions() {
  const pathname = useLocation({ select: (state) => state.pathname });
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const documents = useCanvasStore((state) => state.documents);
  const createConversation = useChatStore((state) => state.createConversation);

  if (pathname === "/") {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className={`${controlClass}`}
          onClick={() => {
            void createConversation();
          }}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
    );
  }

  if (pathname === "/library") {
    return null;
  }

  if (pathname === "/editor") {
    return null;
  }

  if (pathname.startsWith("/canvas")) {
    const activeDocument = documents.find((document) => document.id === activeDocumentId);
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[200px] truncate rounded-sm border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-zinc-300">
          {activeDocument?.name ?? "Untitled board"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={`${controlClass}`}
          onClick={() => {
            void useCanvasStore.getState().createDocument();
          }}
        >
          <CirclePlus className="h-3.5 w-3.5" />
          New Board
        </Button>
      </div>
    );
  }

  return null;
}

export function Header() {
  const pathname = useLocation({ select: (state) => state.pathname });

  const activeTab = useMemo(
    () =>
      NAV_ITEMS.find((item) =>
        item.matches.some((match) =>
          match === "/" ? pathname === "/" : pathname.startsWith(match)
        )
      )?.label ?? "Chat",
    [pathname]
  );

  return (
    <header className="sticky top-0 z-40 bg-[#121214]/80 backdrop-blur-xl">
      <div className="mx-auto grid h-11 w-full max-w-[1600px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 lg:px-5">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Link
            to="/"
            className="flex h-7 w-7 items-center justify-center text-zinc-100 hover:text-zinc-50 transition-colors"
          >
            <Film className="h-3.5 w-3.5" />
          </Link>
          <p className="truncate text-xs font-semibold tracking-wide text-zinc-200">FilmLab Hub</p>
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
