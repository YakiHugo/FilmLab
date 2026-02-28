import { Grid2X2, List, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LibraryFilters } from "./types";

interface FilterBarProps {
  filters: LibraryFilters;
  dayOptions: string[];
  tagOptions: string[];
  onChange: (next: LibraryFilters) => void;
  onReset: () => void;
}

export function FilterBar({ filters, dayOptions, tagOptions, onChange, onReset }: FilterBarProps) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-3 md:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
      <Input
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        placeholder="Search assets, tags..."
        className="h-10 rounded-xl border-white/10 bg-black/35"
      />

      <Select value={filters.day} onValueChange={(value) => onChange({ ...filters, day: value })}>
        <SelectTrigger className="h-10 rounded-xl text-sm">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          {dayOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "all" ? "All days" : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.tag} onValueChange={(value) => onChange({ ...filters, tag: value })}>
        <SelectTrigger className="h-10 rounded-xl text-sm">
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          {tagOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "all" ? "All tags" : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.sort} onValueChange={(value) => onChange({ ...filters, sort: value as LibraryFilters["sort"] })}>
        <SelectTrigger className="h-10 rounded-xl text-sm">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date-desc">Date (newest)</SelectItem>
          <SelectItem value="date-asc">Date (oldest)</SelectItem>
          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          <SelectItem value="size-desc">Size (largest)</SelectItem>
          <SelectItem value="size-asc">Size (smallest)</SelectItem>
        </SelectContent>
      </Select>

      <div className="col-span-full flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={filters.view === "grid" ? "default" : "secondary"}
          className="rounded-xl"
          onClick={() => onChange({ ...filters, view: "grid" })}
        >
          <Grid2X2 className="mr-1 h-4 w-4" />
          Grid
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filters.view === "list" ? "default" : "secondary"}
          className="rounded-xl"
          onClick={() => onChange({ ...filters, view: "list" })}
        >
          <List className="mr-1 h-4 w-4" />
          List
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-xl border border-white/10 bg-black/45"
          onClick={onReset}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Clear filters
        </Button>
      </div>
    </div>
  );
}
