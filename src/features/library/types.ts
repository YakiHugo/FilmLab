export type LibrarySort =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc";

export type LibraryView = "grid" | "list";

export interface LibraryFilters {
  search: string;
  day: string;
  tag: string;
  sort: LibrarySort;
  view: LibraryView;
}
