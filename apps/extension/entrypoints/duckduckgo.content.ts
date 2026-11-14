import type { PlaceResult } from '@rodsandreefs/shared';
import { startEngine, waitFor, type PlaceBlock, type ResultBlock } from '@/utils/engine';

// DuckDuckGo's DOM changes too. Keep every selector in this one place.
const SELECTORS = {
  /** One organic result. Its parent list is the results container. */
  result: 'li[data-layout="organic"]',
  resultLink: 'a[data-testid="result-title-a"]',
  /** The map module (Apple Maps data, located by DuckDuckGo from the IP, not stored). */
  placeCard: '[data-layout="maps_places"] li article',
  placeName: 'h2',
  placeLine: 'p',
  ads: 'li[data-layout="ad"], [data-testid="ad"], .result--ad',
};

export default defineContentScript({
  matches: ['*://duckduckgo.com/*', '*://*.duckduckgo.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    let placesSeen = 0;
    const rerun = await startEngine(ctx, async () => {
      const query = new URLSearchParams(location.search).get('q');
      if (!query) return null;
      // Results render after the page loads, and the map module after that.
      const first = await waitFor(() => document.querySelector<HTMLElement>(SELECTORS.result), 8000);
      const container = first?.parentElement;
      if (!container) return null;
      await waitFor(() => document.querySelector(SELECTORS.placeCard), 2500);
      const places = collectPlaces();
      placesSeen = places.length;

      return {
        query,
        container,
        blocks: collectResults(),
        places,
        ads: [...document.querySelectorAll<HTMLElement>(SELECTORS.ads)],
        insertPanel: (panel) => container.prepend(panel),
        directionsUrl: (name, where) =>
          `https://duckduckgo.com/?iaxm=maps&q=${encodeURIComponent(
            [name, where].filter(Boolean).join(' '),
          )}`,
      };
    });

    // The map module can take several seconds. Re-rank once when it shows up.
    if (placesSeen === 0 && (await waitFor(() => document.querySelector(SELECTORS.placeCard), 12000))) {
      void rerun();
    }
  },
});

function collectResults(): ResultBlock[] {
  const blocks: ResultBlock[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(SELECTORS.result)) {
    const link = el.querySelector<HTMLAnchorElement>(SELECTORS.resultLink);
    const title = link?.textContent?.trim();
    if (!link || !title) continue;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (!url.protocol.startsWith('http') || /(^|\.)duckduckgo\.com$/.test(url.hostname)) continue;
    const text = el.innerText || el.textContent || '';
    blocks.push({
      el,
      result: {
        id: String(blocks.length),
        url: url.href,
        title,
        domain: url.hostname.replace(/^www\./, ''),
        snippet: text.replace(title, '').replace(/\s+/g, ' ').trim().slice(0, 400),
      },
    });
  }
  return blocks;
}

function collectPlaces(): PlaceBlock[] {
  const places: PlaceBlock[] = [];
  for (const card of document.querySelectorAll<HTMLElement>(SELECTORS.placeCard)) {
    // Titles are numbered: "1. CastAway FishCo".
    const raw = card.querySelector(SELECTORS.placeName)?.textContent?.trim() ?? '';
    const name = raw.replace(/^\d+\.\s*/, '');
    if (!name) continue;
    // One line per paragraph ("Yelp (23) · $$ · Outdoor gear", the address, ...).
    const lines = [...card.querySelectorAll<HTMLElement>(SELECTORS.placeLine)]
      .map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 2 && line !== name);
    const place: PlaceResult = {
      id: String(places.length),
      name,
      sponsored: /\b(Sponsored|Ad)\b/.test(card.textContent ?? ''),
      details: lines.join(' | ').slice(0, 400),
    };
    // The card is a row (text | photo); the chip goes at the top of the text column.
    const details = card.querySelector(SELECTORS.placeName)?.parentElement ?? card;
    places.push({ el: card.closest('li') ?? card, details, lines, place });
  }
  return places;
}
