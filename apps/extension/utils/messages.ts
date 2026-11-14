import type { RankRequest, RankResponse } from '@rodsandreefs/shared';

/** What the content script did on the current page. Shown in the popup and toolbar badge. */
export interface PageStats {
  status: 'off' | 'loading' | 'done' | 'error';
  /** Independent shops surfaced (Places pack + organic links). */
  local: number;
  /** Chains, directories and online-only results pushed down. */
  demoted: number;
  /** Sponsored blocks collapsed. */
  ads: number;
  location?: string;
  error?: string;
}

export const EMPTY_STATS: PageStats = { status: 'off', local: 0, demoted: 0, ads: 0 };

/** Content script -> background. */
export type BackgroundMessage =
  | { type: 'rank'; payload: RankRequest }
  | { type: 'stats'; payload: PageStats };

export type BackgroundReply = { ok: true; data: RankResponse } | { ok: false; error: string };

/** Popup -> content script. Replies with PageStats. */
export type ContentMessage = { type: 'get-stats' };
