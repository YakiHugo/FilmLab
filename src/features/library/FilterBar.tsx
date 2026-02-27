import { Input } from "@/components/ui/input";
import type { LibraryFilters } from "./types";

interface FilterBarProps {
  filters: LibraryFilters;
  dayOptions: string[];
  tagOptions: string[];
  onChange: (next: LibraryFilters) => void;
}

export function FilterBar({ filters, dayOptions, tagOptions, onChange }: FilterBarProps) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
      <Input
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder="Search assets, tags..."
        className="h-10 rounded-xl border-white/10 bg-black/35"
      />
      <select
        value={filters.day}
        onChange={(event) => onChange({ ...filters, day: event.target.value })}
        className="h-10 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-zinc-200"
      >
        {dayOptions.map((option) => (
          <option key={option} value={option} className="bg-zinc-900">
            {option === "all" ? "All days" : option}
          </option>
        ))}
      </select>
      <select
        value={filters.tag}
        onChange={(event) => onChange({ ...filters, tag: event.target.value })}
        className="h-10 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-zinc-200"
      >
        {tagOptions.map((option) => (
          <option key={option} value={option} className="bg-zinc-900">
            {option === "all" ? "All tags" : option}
          </option>
        ))}
      </select>
    </div>
  );
}
