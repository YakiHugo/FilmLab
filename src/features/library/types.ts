export type LibrarySort =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc";

export type LibraryView = "grid-compact" | "list" | "masonry";

export type AssetSource = "all" | "imported" | "ai-generated";

export interface LibraryFilters {
  search: string;
  day: string;
  source: AssetSource;
  sort: LibrarySort;
  view: LibraryView;
}
