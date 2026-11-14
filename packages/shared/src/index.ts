// Contract between the extension and the web API. Change both sides together.

/** One organic search result scraped from the results page. */
export interface SearchResult {
  /** Stable id assigned by the content script (index on the page). */
  id: string;
  url: string;
  title: string;
  /** Hostname without "www.", e.g. "crimsonpride.com". */
  domain: string;
}

export interface RankRequest {
  /** The user's search query, e.g. "fishing tackle shop tuscaloosa". */
  query: string;
  results: SearchResult[];
  /** Optional explicit location; otherwise the API infers it (query text / IP). */
  location?: { lat: number; lng: number } | { text: string };
}

export interface RankedResult {
  id: string;
  /** True when the result is a locally owned business near the user. */
  isLocal: boolean;
  /** Short human-readable reason shown in the badge. */
  reason?: string;
}

export interface RankResponse {
  results: RankedResult[];
}

export const API_PATHS = {
  rank: "/api/rank",
} as const;
