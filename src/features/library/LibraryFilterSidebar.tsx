import { Search, X } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLibraryFilterStore } from "./hooks/useLibraryFilterStore";
import type { AssetSource, LibrarySort } from "./types";
import { CollapsibleSection } from "./CollapsibleSection";

interface FilterOption {
  value: string;
  count: number;
}

interface LibraryFilterSidebarProps {
  dayOptions: FilterOption[];
  onImport: (files: FileList) => void;
  className?: string;
}

const SOURCE_OPTIONS: Array<{ value: AssetSource; label: string }> = [
  { value: "all", label: "All" },
  { value: "imported", label: "Imported" },
  { value: "ai-generated", label: "AI Generated" },
];

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: "date-desc", label: "Date (newest)" },
  { value: "date-asc", label: "Date (oldest)" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "size-desc", label: "Size (largest)" },
  { value: "size-asc", label: "Size (smallest)" },
];

const optionButtonClass = (active: boolean) =>
  cn(
    "flex w-full items-center justify-between rounded-sm border px-2 py-1.5 text-xs transition focus-visible:border-yellow-500/60 focus-visible:ring-0",
    active
      ? "border-yellow-500 bg-black/30 text-zinc-100"
      : "border-white/10 bg-black/30 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]"
  );

export function LibraryFilterSidebar({
  dayOptions,
  onImport,
  className,
}: LibraryFilterSidebarProps) {
  const filters = useLibraryFilterStore((state) => state.filters);
  const updateFilters = useLibraryFilterStore((state) => state.updateFilters);
  const resetFilters = useLibraryFilterStore((state) => state.resetFilters);

  return (
    <aside className={cn("flex min-h-0 flex-col bg-[#101114] p-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <Input
          value={filters.search}
          onChange={(event) => updateFilters({ search: event.target.value })}
          placeholder="Search..."
          className="h-9 rounded-sm border-white/10 bg-black/50 pl-9 text-xs text-zinc-200 placeholder:text-zinc-500 caret-yellow-500 focus-visible:border-yellow-500/60 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <UploadButton
        label="Add Photos"
        size="sm"
        variant="secondary"
        className="mt-3 h-9 w-full justify-start rounded-sm border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0"
        labelClassName="text-xs"
        onFiles={onImport}
      />
      <p className="mt-2 text-[11px] text-zinc-500">
        Tip: You can also drag and drop files into the grid.
      </p>

      <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <CollapsibleSection title="Source" count={SOURCE_OPTIONS.length}>
          <div className="space-y-1">
            {SOURCE_OPTIONS.map((source) => (
              <button
                key={source.value}
                type="button"
                className={optionButtonClass(filters.source === source.value)}
                onClick={() => updateFilters({ source: source.value })}
              >
                <span>{source.label}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Dates" count={Math.max(0, dayOptions.length - 1)}>
          <div className="space-y-1">
            {dayOptions.slice(0, 21).map((option) => (
              <button
                key={option.value}
                type="button"
                className={optionButtonClass(filters.day === option.value)}
                onClick={() => updateFilters({ day: option.value })}
              >
                <span className="truncate">
                  {option.value === "all" ? "All dates" : option.value}
                </span>
                <span className="text-[11px] text-zinc-500">{option.count}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Sort" defaultOpen={false} count={SORT_OPTIONS.length}>
          <div className="space-y-1">
            {SORT_OPTIONS.map((sortOption) => (
              <button
                key={sortOption.value}
                type="button"
                className={optionButtonClass(filters.sort === sortOption.value)}
                onClick={() => updateFilters({ sort: sortOption.value })}
              >
                <span>{sortOption.label}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <button
        type="button"
        className="mt-3 inline-flex h-9 items-center justify-center gap-1 rounded-sm border border-white/10 bg-black/45 px-3 text-xs text-zinc-300 transition hover:border-white/20 hover:text-zinc-100 focus-visible:border-yellow-500/60 focus-visible:ring-0"
        onClick={resetFilters}
      >
        <X className="h-3.5 w-3.5" />
        Reset Filters
      </button>
    </aside>
  );
}
