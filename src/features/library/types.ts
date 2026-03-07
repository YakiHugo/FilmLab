export type LibrarySort =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc";

export type LibraryView = "grid-compact" | "list" | "masonry";

export type AssetSource = "all" | "imported" | "ai-generated";
export type AssetOriginFilter = "all" | "file" | "url" | "ai";

export interface LibraryFilters {
  search: string;
  day: string;
  liked: "all" | "liked";
  source: AssetSource;
  origin: AssetOriginFilter;
  sort: LibrarySort;
  view: LibraryView;
}
