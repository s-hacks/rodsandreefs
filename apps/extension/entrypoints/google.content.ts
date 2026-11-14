import { log, startEngine, textLines, type PlaceBlock, type ResultBlock } from '@/utils/engine';

// Google's DOM changes often. Keep every selector in this one place.
const SELECTORS = {
  resultsContainer: '#rso',
  /** Organic result titles. The link is found from the title, not the other way round. */
  resultTitle: 'h3, [role="heading"][aria-level="3"]',
  resultSnippet: '.VwiC3b, [data-sncf], [style*="-webkit-line-clamp"]',
  /** Detail block of one business in the Places / map pack. */
  placeDetails: '.rllt__details',
  placeName: '[role="heading"], .OSrXXb, .dbg0pd',
  placeWebsite: 'a[href]',
  /** Sponsored blocks: text ads and shopping carousels. */
  ads: '#tads, #tadsb, #bottomads, .commercial-unit-desktop-top, .cu-container',
  /** The "Tuscaloosa, Alabama" location Google prints in the footer. */
  pageLocation: '#swml-loc, .dfB0uf, #Wprf1b',
};

export default defineContentScript({
  matches: ['*://*.google.com/search*'],
  runAt: 'document_idle',
  main: (ctx) =>
    startEngine(ctx, async () => {
      const query = new URLSearchParams(location.search).get('q');
      const container = document.querySelector<HTMLElement>(SELECTORS.resultsContainer);
      if (!query || !container) {
        log('no query or results container found', { query, container });
        return null;
      }
      return {
        query,
        container,
        blocks: collectResults(container),
        places: collectPlaces(),
        ads: [...document.querySelectorAll<HTMLElement>(SELECTORS.ads)],
        location: findPageLocation(),
        insertPanel: (panel) => container.prepend(panel),
        directionsUrl: (name, where) =>
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [name, where].filter(Boolean).join(' '),
          )}`,
      };
    }),
});

const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/;

/**
 * Returns the real destination of a link, unwrapping Google's /url?q= redirects.
 * Returns null for links that stay on Google (maps, more results, etc.).
 */
function resolveUrl(href: string, depth = 0): URL | null {
  try {
    const url = new URL(href, location.href);
    if (GOOGLE_HOST.test(url.hostname) && url.pathname === '/url' && depth < 2) {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url');
      return target ? resolveUrl(target, depth + 1) : null;
    }
    if (!url.protocol.startsWith('http') || GOOGLE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Counts organic titles, ignoring the names inside the Places pack. */
function organicTitleCount(el: Element): number {
  let n = 0;
  for (const h of el.querySelectorAll(SELECTORS.resultTitle)) {
    if (!h.closest(SELECTORS.placeDetails)) n++;
  }
  return n;
}

/**
 * Finds organic results. For each title, walks up to the largest ancestor that
 * still contains only that one title. That element is the movable block.
 */
function collectResults(container: HTMLElement): ResultBlock[] {
  const blocks: ResultBlock[] = [];
  const seen = new Set<HTMLElement>();

  for (const heading of container.querySelectorAll<HTMLElement>(SELECTORS.resultTitle)) {
    const title = heading.textContent?.trim();
    if (!title || heading.closest(SELECTORS.ads) || heading.closest(SELECTORS.placeDetails)) {
      continue;
    }

    // The title is usually inside its link; sometimes the link is a sibling.
    let link = heading.closest<HTMLAnchorElement>('a[href]');
    for (let p = heading.parentElement, i = 0; !link && p && i < 3; p = p.parentElement, i++) {
      link = p.querySelector<HTMLAnchorElement>('a[href]');
    }
    const url = link ? resolveUrl(link.href) : null;
    if (!url) continue;

    let el: HTMLElement = heading;
    while (
      el.parentElement &&
      el.parentElement !== container &&
      organicTitleCount(el.parentElement) === 1
    ) {
      el = el.parentElement;
    }
    if (seen.has(el) || el.querySelector(SELECTORS.placeDetails)) continue;
    seen.add(el);

    blocks.push({
      el,
      result: {
        id: String(blocks.length),
        url: url.href,
        title,
        domain: url.hostname.replace(/^www\./, ''),
        snippet: el.querySelector(SELECTORS.resultSnippet)?.textContent?.trim().slice(0, 400),
      },
    });
  }
  return blocks;
}

/** A line like "Birmingham, AL 35203": how Google shows the user's own location. */
const LOCATION_LINE = /^[A-Z][A-Za-z .'-]+, [A-Z]{2} \d{5}$/;

/** The user's location as Google shows it on the page, if it can be found. */
function findPageLocation(): string | undefined {
  const known = document.querySelector(SELECTORS.pageLocation)?.textContent?.trim();
  if (known && /, [A-Z]{2}\b/.test(known)) return known.slice(0, 100);

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.parentElement?.textContent?.trim();
    if (text && text.length < 60 && LOCATION_LINE.test(text)) return text;
  }
  return undefined;
}

/** Finds businesses in the Places / map pack, using the same walk-up trick. */
function collectPlaces(): PlaceBlock[] {
  const places: PlaceBlock[] = [];
  const all = document.querySelectorAll<HTMLElement>(SELECTORS.placeDetails);

  for (const details of all) {
    const name = details.querySelector(SELECTORS.placeName)?.textContent?.trim();
    if (!name) continue;

    let el: HTMLElement = details;
    // With a single place there is nothing to stop the walk, so cap it.
    for (let depth = 0; depth < 6; depth++) {
      const parent = el.parentElement;
      if (!parent || parent === document.body) break;
      if (parent.querySelectorAll(SELECTORS.placeDetails).length !== 1) break;
      if (parent.matches(SELECTORS.resultsContainer) || organicTitleCount(parent) > 0) break;
      el = parent;
    }

    const lines = textLines(details, name);
    let website: string | undefined;
    for (const a of el.querySelectorAll<HTMLAnchorElement>(SELECTORS.placeWebsite)) {
      website = resolveUrl(a.href)?.href;
      if (website) break;
    }
    places.push({
      el,
      details,
      lines,
      place: {
        id: String(places.length),
        name,
        sponsored: /\bSponsored\b/.test(el.textContent ?? ''),
        website,
        details: lines.join(' | ').slice(0, 400),
      },
    });
  }
  return places;
}
