import type { PlaceResult, RankResponse, RankedResult, SearchResult } from '@rodsandreefs/shared';
import { enabledItem } from '@/utils/config';
import {
  EMPTY_STATS,
  type BackgroundMessage,
  type BackgroundReply,
  type ContentMessage,
  type PageStats,
} from '@/utils/messages';
import './style.css';

// Google's DOM changes often. Keep every selector in this one place.
const SELECTORS = {
  resultsContainer: '#rso',
  /** Organic result title links. */
  resultLink: 'a:has(h3)',
  resultTitle: 'h3',
  resultSnippet: '.VwiC3b, [data-sncf], [style*="-webkit-line-clamp"]',
  /** Detail block of one business in the Places / map pack. */
  placeDetails: '.rllt__details',
  placeName: '[role="heading"], .OSrXXb, .dbg0pd',
  placeWebsite: 'a[href^="http"]:not([href*="google."])',
  /** Sponsored blocks: text ads and shopping carousels. */
  ads: '#tads, #tadsb, #bottomads, .commercial-unit-desktop-top, .cu-container',
  /** The "Tuscaloosa, Alabama" location Google prints in the footer. */
  pageLocation: '#swml-loc, .dfB0uf, #Wprf1b',
};

const MAX_PICKS = 6;
const log = (...args: unknown[]) => console.log('[shop-local]', ...args);

interface ResultBlock {
  el: HTMLElement;
  result: SearchResult;
}
interface PlaceBlock {
  el: HTMLElement;
  details: HTMLElement;
  place: PlaceResult;
  /** Detail lines without the name, for the picks panel. */
  lines: string[];
}

let stats: PageStats = EMPTY_STATS;
/** Steps that put the page back exactly as Google rendered it, in apply order. */
let undo: (() => void)[] = [];
/** Bumped on every run/revert so a slow API reply can't apply to a newer state. */
let generation = 0;

export default defineContentScript({
  matches: ['*://*.google.com/search*'],
  runAt: 'document_idle',
  async main(ctx) {
    browser.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
      if (message?.type === 'get-stats') sendResponse(stats);
    });

    // The popup toggle applies live, with no reload.
    const unwatch = enabledItem.watch((enabled) => {
      if (enabled) void run();
      else revert();
    });
    ctx.onInvalidated(unwatch);

    // Google sometimes swaps results in place instead of loading a new page.
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      revert();
      ctx.setTimeout(async () => {
        if (await enabledItem.getValue()) void run();
      }, 800);
    });

    if (await enabledItem.getValue()) await run();
  },
});

function setStats(next: PageStats) {
  stats = next;
  const message: BackgroundMessage = { type: 'stats', payload: next };
  // Fails harmlessly if the extension was reloaded under this page.
  try {
    browser.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension context is gone.
  }
}

async function run() {
  revert();
  const mine = ++generation;
  try {
    const query = new URLSearchParams(location.search).get('q');
    const container = document.querySelector<HTMLElement>(SELECTORS.resultsContainer);
    if (!query || !container) {
      log('no query or results container found', { query, container });
      return;
    }

    const blocks = collectResults(container);
    const places = collectPlaces();
    log(
      `found ${blocks.length} results and ${places.length} places`,
      blocks.map((b) => b.result.domain),
      places.map((p) => p.place.name),
    );
    if (blocks.length === 0 && places.length === 0) return;

    setStats({ ...EMPTY_STATS, status: 'loading' });
    const pageLocation = document
      .querySelector(SELECTORS.pageLocation)
      ?.textContent?.trim()
      .slice(0, 100);
    const message: BackgroundMessage = {
      type: 'rank',
      payload: {
        query,
        results: blocks.map((b) => b.result),
        places: places.map((p) => p.place),
        location: pageLocation ? { text: pageLocation } : undefined,
      },
    };
    const reply: BackgroundReply | undefined = await browser.runtime.sendMessage(message);
    if (mine !== generation) return; // Toggled off or re-run while waiting.
    if (!reply?.ok) {
      log('ranking failed. Is the web app running on localhost:3000?', reply);
      setStats({ ...EMPTY_STATS, status: 'error', error: reply?.error ?? 'No reply' });
      return;
    }
    log('API reply', reply.data);
    apply(container, blocks, places, reply.data);
  } catch (err) {
    // Never break Google: put everything back and stay quiet.
    log('unexpected error', err);
    revert();
    setStats({ ...EMPTY_STATS, status: 'error', error: String(err) });
  }
}

/** Restores the page to how Google rendered it. */
function revert() {
  generation++;
  if (undo.length > 0) {
    const steps = undo.reverse();
    undo = [];
    flip(() => {
      for (const step of steps) {
        try {
          step();
        } catch {
          // The node is gone (Google re-rendered); nothing to restore.
        }
      }
    });
  }
  setStats(EMPTY_STATS);
}

function apply(
  container: HTMLElement,
  blocks: ResultBlock[],
  places: PlaceBlock[],
  data: RankResponse,
) {
  const resultRank = new Map(data.results.map((r) => [r.id, r]));
  const placeRank = new Map((data.places ?? []).map((r) => [r.id, r]));
  const localBlocks = blocks.filter((b) => resultRank.get(b.result.id)?.isLocal);
  const localPlaces = places.filter((p) => placeRank.get(p.place.id)?.isLocal);
  let demoted = 0;
  let ads = 0;

  const dark = isDarkPage();
  document.documentElement.classList.toggle('rr-dark', dark);
  undo.push(() => document.documentElement.classList.remove('rr-dark'));

  flip(() => {
    // 1. Organic links: independents above the first organic result, in order.
    //    Google's own widgets above that (map pack, etc.) stay put.
    for (const block of blocks) {
      const rank = resultRank.get(block.result.id);
      if (!rank || rank.kind === 'unknown') continue;
      if (rank.isLocal) {
        mark(block.el, 'rr-local');
        addChip(block.el, 'local', rank.reason ?? 'Independent');
      } else {
        mark(block.el, 'rr-dim');
        addChip(block.el, 'other', rank.reason ?? 'Not local');
        demoted++;
      }
    }
    if (blocks.length > 0 && localBlocks.length > 0) {
      const marker = document.createComment('rr-marker');
      blocks[0]!.el.before(marker);
      undo.push(() => marker.remove());
      for (const block of localBlocks) moveBefore(block.el, marker);
    }

    // 2. Places pack: badge independents, sink chains (sponsored ones last).
    for (const p of places) {
      const rank = placeRank.get(p.place.id);
      if (!rank) continue;
      if (rank.isLocal) {
        addChip(p.details, 'local', 'Local');
      } else {
        addChip(p.details, 'other', rank.reason ?? 'Chain');
        if (places.length > 1) mark(p.el, 'rr-dim');
        demoted++;
      }
    }
    reorderPlaces(places, placeRank);

    // 3. Sponsored blocks: collapse behind a pill the user can open.
    for (const ad of document.querySelectorAll<HTMLElement>(SELECTORS.ads)) {
      if (ad.offsetHeight === 0 || ad.closest('.rr-ad-collapsed')) continue;
      collapseAd(ad);
      ads++;
    }

    // 4. The picks panel: independents near the user, even when no organic
    //    link points to them.
    if (localPlaces.length > 0) {
      const panel = buildPanel(localPlaces.slice(0, MAX_PICKS), data.location);
      container.prepend(panel);
      undo.push(() => panel.remove());
    }
  });

  log(`surfaced ${localBlocks.length} links + ${localPlaces.length} places, demoted ${demoted}`);
  setStats({
    status: 'done',
    local: localBlocks.length + localPlaces.length,
    demoted,
    ads,
    location: data.location,
  });
}

// ---------- scraping ----------

/**
 * Finds organic results. For each title link, walks up to the largest ancestor
 * that still contains only that one result. That element is the movable block.
 */
function collectResults(container: HTMLElement): ResultBlock[] {
  const blocks: ResultBlock[] = [];
  const seen = new Set<HTMLElement>();

  for (const link of container.querySelectorAll<HTMLAnchorElement>(SELECTORS.resultLink)) {
    const title = link.querySelector(SELECTORS.resultTitle)?.textContent?.trim();
    if (!link.href || !title || link.closest(SELECTORS.ads)) continue;

    let el: HTMLElement = link;
    while (
      el.parentElement &&
      el.parentElement !== container &&
      el.parentElement.querySelectorAll(SELECTORS.resultLink).length === 1
    ) {
      el = el.parentElement;
    }
    if (seen.has(el) || el.querySelector(SELECTORS.placeDetails)) continue;
    seen.add(el);

    try {
      const url = new URL(link.href);
      if (!url.protocol.startsWith('http') || /(^|\.)google\.com$/.test(url.hostname)) continue;
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
    } catch {
      // Skip malformed hrefs.
    }
  }
  return blocks;
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
      if (parent.matches(SELECTORS.resultsContainer) || parent.querySelector(SELECTORS.resultLink)) break;
      el = parent;
    }

    const lines = (details.innerText || details.textContent || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && line !== name && !/^sponsored$/i.test(line));
    const website = el.querySelector<HTMLAnchorElement>(SELECTORS.placeWebsite)?.href;
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

// ---------- page changes (every one registers its own undo) ----------

function mark(el: HTMLElement, className: string) {
  el.classList.add(className);
  undo.push(() => el.classList.remove(className));
}

function addChip(parent: HTMLElement, kind: 'local' | 'other', text: string) {
  const chip = document.createElement('div');
  chip.className = `rr-chip rr-chip-${kind}`;
  chip.textContent = kind === 'local' ? `★ ${text}` : text;
  parent.prepend(chip);
  undo.push(() => chip.remove());
}

/** Moves `el` before `ref`, leaving a placeholder so it can be put back. */
function moveBefore(el: HTMLElement, ref: ChildNode) {
  const placeholder = document.createComment('rr-origin');
  el.before(placeholder);
  ref.before(el);
  undo.push(() => placeholder.replaceWith(el));
}

function reorderPlaces(places: PlaceBlock[], rank: Map<string, RankedResult>) {
  const parent = places[0]?.el.parentElement;
  if (places.length < 2 || !parent || places.some((p) => p.el.parentElement !== parent)) return;

  const score = (p: PlaceBlock) =>
    rank.get(p.place.id)?.isLocal ? 0 : p.place.sponsored ? 2 : 1;
  const sorted = [...places].sort((a, b) => score(a) - score(b));
  if (sorted.every((p, i) => p === places[i])) return;

  const marker = document.createComment('rr-marker');
  places[0]!.el.before(marker);
  undo.push(() => marker.remove());
  for (const p of sorted) moveBefore(p.el, marker);
}

function collapseAd(ad: HTMLElement) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'rr-ad-pill';
  const label = (open: boolean) =>
    open ? 'Hide sponsored results' : 'Sponsored results tucked away · Show';
  pill.textContent = label(false);
  pill.addEventListener('click', () => {
    const open = ad.classList.toggle('rr-ad-collapsed') === false;
    pill.textContent = label(open);
  });
  ad.classList.add('rr-ad-collapsed');
  ad.before(pill);
  undo.push(() => {
    pill.remove();
    ad.classList.remove('rr-ad-collapsed');
  });
}

function buildPanel(picks: PlaceBlock[], where: string | undefined): HTMLElement {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  const panel = node('section', 'rr-panel');
  const head = node('div', 'rr-panel-head');
  head.append(
    node('span', 'rr-panel-mark', '★'),
    node('span', 'rr-panel-title', where ? `Local picks in ${where}` : 'Local picks near you'),
    node('span', 'rr-panel-sub', 'Independent shops, ahead of the chains'),
  );
  const list = node('div', 'rr-panel-list');

  picks.forEach((pick, i) => {
    const card = node('div', 'rr-card');
    card.style.setProperty('--rr-i', String(i));
    card.append(node('div', 'rr-card-name', pick.place.name));
    for (const line of pick.lines.slice(0, 2)) card.append(node('div', 'rr-card-line', line));

    const actions = node('div', 'rr-card-actions');
    if (pick.place.website) {
      const site = node('a', 'rr-card-link rr-card-link-primary', 'Website');
      site.href = pick.place.website;
      actions.append(site);
    }
    const maps = node('a', 'rr-card-link', 'Directions');
    const search = [pick.place.name, where].filter(Boolean).join(' ');
    maps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(search)}`;
    maps.target = '_blank';
    maps.rel = 'noopener';
    actions.append(maps);
    card.append(actions);
    list.append(card);
  });

  panel.append(head, list);
  return panel;
}

// ---------- helpers ----------

/** Google's dark theme isn't tied to the OS setting, so read the page itself. */
function isDarkPage(): boolean {
  const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (!rgb || rgb.length < 3) return false;
  if (rgb.length >= 4 && Number(rgb[3]) === 0) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return (Number(rgb[0]) + Number(rgb[1]) + Number(rgb[2])) / 3 < 128;
}

/**
 * Runs `mutate`, then glides every result from where it was to where it is now
 * (FLIP), so reordering reads as movement instead of a jump.
 */
function flip(mutate: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const container = document.querySelector<HTMLElement>(SELECTORS.resultsContainer);
  if (reduced || !container) return mutate();

  const targets = new Set<HTMLElement>();
  for (const child of container.children) targets.add(child as HTMLElement);
  for (const el of container.querySelectorAll<HTMLElement>('.rr-local, .rr-dim')) targets.add(el);
  const before = new Map<HTMLElement, DOMRect>();
  for (const el of targets) before.set(el, el.getBoundingClientRect());

  mutate();

  for (const [el, from] of before) {
    if (!el.isConnected) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }
}
