export type AdminSearchKind =
  | "course"
  | "section"
  | "material"
  | "student"
  | "tool"
  | "environment";

export type AdminSearchResult = {
  id: string;
  kind: AdminSearchKind;
  title: string;
  detail: string;
  href: string;
};

export type AdminSearchResponse = {
  version: "admin-search-v1";
  query: string;
  results: AdminSearchResult[];
};
