// Contract between the extension and the web API. Change both sides together.

/** One organic search result scraped from the results page. */
export interface SearchResult {
  /** Stable id assigned by the content script (index on the page). */
  id: string;
  url: string;
  title: string;
  /** Hostname without "www.", e.g. "crimsonpride.com". */
  domain: string;
  /** Description text under the title, when the page shows one. */
  snippet?: string;
}

/** One business from Google's Places / map pack on the results page. */
export interface PlaceResult {
  /** Stable id assigned by the content script (index in the pack). */
  id: string;
  name: string;
  /** True when Google marks the listing as an ad. */
  sponsored: boolean;
  /** The business's own website, when the pack links to it. */
  website?: string;
  /** Raw detail text (rating, category, address, hours) shown under the name. */
  details?: string;
}

export interface RankRequest {
  /** The user's search query, e.g. "fishing tackle shop tuscaloosa". */
  query: string;
  results: SearchResult[];
  /** Businesses in the Places pack. They're physically near the user by construction. */
  places?: PlaceResult[];
  /** Optional explicit location; otherwise the API infers it (query text / places). */
  location?: { lat: number; lng: number } | { text: string };
}

/**
 * What a result is:
 * - `local`: independent business with a physical location near the user
 * - `chain`: multi-location brand
 * - `directory`: aggregator, review site, forum or social network
 * - `online`: marketplace or online-only retailer
 * - `unknown`: no evidence either way (left untouched)
 */
export type ResultKind = "local" | "chain" | "directory" | "online" | "unknown";

export interface RankedResult {
  id: string;
  /** True when the result is a locally owned business near the user. */
  isLocal: boolean;
  kind: ResultKind;
  /** Short human-readable reason shown in the badge. */
  reason?: string;
}

export interface RankResponse {
  results: RankedResult[];
  /** One entry per `places` item in the request. */
  places: RankedResult[];
  /** The city the API settled on, e.g. "Tuscaloosa, AL". */
  location?: string;
}

export const API_PATHS = {
  rank: "/api/rank",
} as const;
