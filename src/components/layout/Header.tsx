import { Link, useLocation } from "@tanstack/react-router";
import { CirclePlus, Film, MessageSquarePlus } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useChatStore } from "@/stores/chatStore";
import { useEditorStore } from "@/stores/editorStore";

const NAV_ITEMS = [
  { label: "Chat", to: "/" as const, matches: ["/"] },
  { label: "Library", to: "/library" as const, matches: ["/library"] },
  { label: "Canvas", to: "/canvas" as const, matches: ["/canvas"] },
];
const controlClass =
  "rounded-sm border border-white/10 bg-black/45 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0";

function ContextActions() {
  const pathname = useLocation({ select: (state) => state.pathname });
  const assets = useAssetStore((state) => state.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const documents = useCanvasStore((state) => state.documents);
  const createConversation = useChatStore((state) => state.createConversation);

  if (pathname === "/") {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className={`h-9 ${controlClass}`}
          onClick={() => {
            void createConversation();
          }}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New
        </Button>
      </div>
    );
  }

  if (pathname === "/library") {
    return null;
  }

  if (pathname === "/editor") {
    const selectedName = assets.find((asset) => asset.id === selectedAssetId)?.name ?? "No asset";
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[220px] truncate rounded-sm border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-300">
          {selectedName}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={`h-9 ${controlClass}`}
          onClick={() => useEditorStore.getState().setSelectedAssetId(selectedAssetId)}
          disabled={!selectedAssetId}
        >
          Sync
        </Button>
      </div>
    );
  }

  if (pathname.startsWith("/canvas")) {
    const activeDocument = documents.find((document) => document.id === activeDocumentId);
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[220px] truncate rounded-sm border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-300">
          {activeDocument?.name ?? "Untitled board"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={`h-9 ${controlClass}`}
          onClick={() => {
            void useCanvasStore.getState().createDocument();
          }}
        >
          <CirclePlus className="h-4 w-4" />
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
      )?.label ?? null,
    [pathname]
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#121214]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-3 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-white/20 bg-black/45 text-zinc-100"
          >
            <Film className="h-4 w-4" />
          </Link>
          <p className="truncate text-sm font-semibold tracking-wide text-zinc-200">FilmLab Hub</p>
        </div>

        <nav className="hidden items-center gap-1 rounded-sm border border-white/10 bg-black/35 p-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "rounded-sm border border-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition focus-visible:border-yellow-500/60 focus-visible:ring-0",
                  isActive && "border-yellow-500/60 bg-yellow-500/10 text-zinc-100",
                  !isActive && "hover:bg-white/10"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center gap-2">
          <ContextActions />
        </div>
      </div>
    </header>
  );
}
