import {
  CheckSquare,
  Columns3,
  LayoutGrid,
  List,
  PanelLeft,
  PanelRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryView } from "./types";

interface LibraryToolbarProps {
  view: LibraryView;
  resultsCount: number;
  selectedCount: number;
  allSelected: boolean;
  detailPanelOpen: boolean;
  onViewChange: (view: LibraryView) => void;
  onToggleAll: () => void;
  onToggleDetailPanel: () => void;
  onToggleFilterPanel: () => void;
}

const VIEW_ITEMS: Array<{
  value: LibraryView;
  label: string;
  icon: LucideIcon;
  mobileOnly?: "show" | "hide";
}> = [
  { value: "grid-compact", label: "Compact", icon: LayoutGrid, mobileOnly: "hide" },
  { value: "list", label: "List", icon: List },
  { value: "masonry", label: "Masonry", icon: Columns3, mobileOnly: "hide" },
];

export function LibraryToolbar({
  view,
  resultsCount,
  selectedCount,
  allSelected,
  detailPanelOpen,
  onViewChange,
  onToggleAll,
  onToggleDetailPanel,
  onToggleFilterPanel,
}: LibraryToolbarProps) {
  const controlClass =
    "rounded-sm border border-white/10 bg-black/40 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#15171a] px-3 py-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={cn("lg:hidden", controlClass)}
        onClick={onToggleFilterPanel}
      >
        <PanelLeft className="mr-1 h-4 w-4" />
        Filters
      </Button>

      <div className="flex items-center gap-1 rounded-sm border border-white/10 bg-black/35 p-1">
        {VIEW_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              title={item.label}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-zinc-400 transition hover:text-zinc-200 focus-visible:border-yellow-500/60 focus-visible:ring-0",
                view === item.value && "border-yellow-500/60 bg-yellow-500/10 text-zinc-100",
                item.mobileOnly === "hide" && "hidden md:inline-flex",
              )}
              onClick={() => onViewChange(item.value)}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <p className="ml-1 text-xs text-zinc-500">{resultsCount} photos</p>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={controlClass}
          onClick={onToggleAll}
          disabled={resultsCount === 0}
        >
          <CheckSquare className="mr-1 h-4 w-4" />
          {allSelected && selectedCount > 0 ? "Clear" : "Select All"}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={controlClass}
          onClick={onToggleDetailPanel}
        >
          {detailPanelOpen ? (
            <>
              <PanelRight className="mr-1 h-4 w-4" />
              Hide Info
            </>
          ) : (
            <>
              <PanelRight className="mr-1 h-4 w-4" />
              Show Info
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
