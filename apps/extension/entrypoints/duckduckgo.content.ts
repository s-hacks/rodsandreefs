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
  /** The request that carries the map module's data, including websites. */
  placeData: /\/local\.js\?.*tg=maps_places/,
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
      if (places.length) {
        const sites = await fetchWebsites();
        for (const p of places) p.place.website = sites.get(key(p.place.name));
      }

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

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The map cards don't link to the shops' own sites, but the data behind them
 * does. Re-read the request the page already made (same origin, so no extra
 * permission) and pull each shop's website out of it.
 */
async function fetchWebsites(): Promise<Map<string, string>> {
  const sites = new Map<string, string>();
  try {
    const entry = performance
      .getEntriesByType('resource')
      .findLast((e) => SELECTORS.placeData.test(e.name));
    if (!entry) return sites;
    const text = await (await fetch(entry.name, { signal: AbortSignal.timeout(4000) })).text();
    const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
      results?: { name?: string; website?: string }[];
    };
    for (const r of data.results ?? []) {
      // A Yelp or Facebook page isn't the shop's own site.
      if (!r.name || !r.website || !/^https?:\/\//.test(r.website)) continue;
      if (/\/\/([\w-]+\.)*(yelp|facebook|tripadvisor|instagram)\.com\//.test(r.website)) continue;
      sites.set(key(r.name), r.website);
    }
  } catch {
    // No websites this time; the panel still works without them.
  }
  return sites;
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
