import type { SearchOutcome, SearchResult } from "../search/types.js";

export type SharedCommandOptions = {
  gl: string;
  headed: boolean;
  json: boolean;
  lang: string;
  userDataDir: string;
};

export type SearchCommandOptions = SharedCommandOptions & {
  num: number;
  parallel: number;
  queries: string[];
};

export type LoginCommandOptions = Omit<SharedCommandOptions, "headed" | "json">;

export type PrintableSearchResult = SearchResult;
export type PrintableSearchOutcome = SearchOutcome;
