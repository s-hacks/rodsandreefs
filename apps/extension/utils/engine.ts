import type { PlaceResult, RankResponse, RankedResult, SearchResult } from '@rodsandreefs/shared';
import type { ContentScriptContext } from '#imports';
import { cityItem, enabledItem, totalItem } from '@/utils/config';
import {
  EMPTY_STATS,
  type BackgroundMessage,
  type BackgroundReply,
  type ContentMessage,
  type PageStats,
} from '@/utils/messages';
import '@/assets/page.css';

// Everything that changes a results page, shared by every search engine. Each
// engine's content script only scrapes its own markup into a `Scrape`.

const MAX_PICKS = 6;
export const log = (...args: unknown[]) => console.log('[shop-local]', ...args);

export interface ResultBlock {
  /** The element that gets moved. */
  el: HTMLElement;
  result: SearchResult;
}

export interface PlaceBlock {
  /** The element that gets moved within the map list. */
  el: HTMLElement;
  /** Where the chip goes. */
  details: HTMLElement;
  place: PlaceResult;
  /** Detail lines without the name, for the picks panel. */
  lines: string[];
}

export interface Scrape {
  query: string;
  /** Results area. Its children are animated when they move. */
  container: HTMLElement;
  blocks: ResultBlock[];
  places: PlaceBlock[];
  ads: HTMLElement[];
  /** The user's location as the page shows it, e.g. "Birmingham, AL 35203". */
  location?: string;
  insertPanel(panel: HTMLElement): void;
  directionsUrl(name: string, where: string | undefined): string;
}

let stats: PageStats = EMPTY_STATS;
/** Steps that put the page back exactly as it was rendered, in apply order. */
let undo: (() => void)[] = [];
/** Bumped on every run/revert so a slow API reply can't apply to a newer state. */
let generation = 0;
let container: HTMLElement | null = null;
/** True once this search has been added to the popup's running total. */
let counted = false;

/**
 * Wires a content script up: popup stats, the live on/off toggle, and in-page
 * navigation. `scrape` returns null when the page isn't ready or has no results.
 */
export async function startEngine(
  ctx: ContentScriptContext,
  scrape: () => Promise<Scrape | null>,
) {
  browser.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    if (message?.type === 'get-stats') sendResponse(stats);
  });

  const rerun = async () => {
    if (await enabledItem.getValue()) void run(scrape);
    else revert();
  };
  const unwatch = [enabledItem.watch(rerun), cityItem.watch(rerun)];
  ctx.onInvalidated(() => unwatch.forEach((fn) => fn()));

  // Search pages often swap results in place instead of loading a new page.
  ctx.addEventListener(window, 'wxt:locationchange', () => {
    counted = false;
    revert();
    ctx.setTimeout(rerun, 800);
  });

  await rerun();
  /** Lets an engine re-rank when part of its page loads late. */
  return rerun;
}

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

async function run(scrape: () => Promise<Scrape | null>) {
  revert();
  const mine = ++generation;
  try {
    const page = await scrape();
    if (mine !== generation) return;
    if (!page) {
      log('no results found on this page');
      return;
    }
    const { blocks, places } = page;
    log(
      `found ${blocks.length} results and ${places.length} places`,
      blocks.map((b) => b.result.domain),
      places.map((p) => p.place.name),
    );
    if (blocks.length === 0 && places.length === 0) return;

    setStats({ ...EMPTY_STATS, status: 'loading' });
    // The page's own location wins; the popup's city covers pages that show none.
    const where = page.location ?? ((await cityItem.getValue()).trim() || undefined);
    const message: BackgroundMessage = {
      type: 'rank',
      payload: {
        query: page.query,
        results: blocks.map((b) => b.result),
        places: places.map((p) => p.place),
        location: where ? { text: where } : undefined,
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
    apply(page, reply.data);
  } catch (err) {
    // Never break the search page: put everything back and stay quiet.
    log('unexpected error', err);
    revert();
    setStats({ ...EMPTY_STATS, status: 'error', error: String(err) });
  }
}

/** Restores the page to how it was rendered. */
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
          // The node is gone (the page re-rendered); nothing to restore.
        }
      }
    });
  }
  setStats(EMPTY_STATS);
}

function apply(page: Scrape, data: RankResponse) {
  const { blocks, places } = page;
  container = page.container;
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
    //    The engine's own widgets above that (map pack, etc.) stay put.
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

    // 2. Map pack: badge independents, sink chains (sponsored ones last).
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
    for (const ad of page.ads) {
      if (ad.offsetHeight === 0 || ad.closest('.rr-ad-collapsed')) continue;
      collapseAd(ad);
      ads++;
    }

    // 4. The picks panel: independents near the user, even when no organic
    //    link points to them.
    if (localPlaces.length > 0) {
      const panel = buildPanel(localPlaces.slice(0, MAX_PICKS), data.location, page.directionsUrl);
      page.insertPanel(panel);
      undo.push(() => panel.remove());
    }
  });

  log(`surfaced ${localBlocks.length} links + ${localPlaces.length} places, demoted ${demoted}`);
  const local = localBlocks.length + localPlaces.length;
  showToast(local, demoted);
  if (!counted && local > 0) {
    counted = true;
    void totalItem.getValue().then((n) => totalItem.setValue(n + local));
  }
  setStats({
    status: 'done',
    local,
    demoted,
    ads,
    location: data.location,
  });
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

function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Website';
  }
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

/** A brief note at the bottom of the page saying what just changed. */
function showToast(local: number, demoted: number) {
  if (local === 0 && demoted === 0) return;
  const toast = document.createElement('div');
  toast.className = 'rr-toast';
  toast.setAttribute('role', 'status');
  const lead = document.createElement('strong');
  lead.textContent =
    local > 0 ? `★ ${local} local ${local === 1 ? 'pick' : 'picks'} lifted` : 'No local shops here';
  toast.append(lead);
  if (demoted > 0) toast.append(` · ${demoted} chains and directories pushed down`);
  document.body.append(toast);
  const timer = setTimeout(() => toast.remove(), 5200);
  undo.push(() => {
    clearTimeout(timer);
    toast.remove();
  });
}

function buildPanel(
  picks: PlaceBlock[],
  where: string | undefined,
  directionsUrl: Scrape['directionsUrl'],
): HTMLElement {
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
    if (pick.place.website) {
      // The shop's own site, shown like a search result's address.
      const site = node('a', 'rr-card-site', siteLabel(pick.place.website));
      site.href = pick.place.website;
      card.append(site);
    }
    for (const line of pick.lines.slice(0, 2)) card.append(node('div', 'rr-card-line', line));

    const actions = node('div', 'rr-card-actions');
    if (pick.place.website) {
      const site = node('a', 'rr-card-link rr-card-link-primary', 'Website');
      site.href = pick.place.website;
      actions.append(site);
    }
    const maps = node('a', 'rr-card-link', 'Directions');
    maps.href = directionsUrl(pick.place.name, where);
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

/** Search engines' dark themes aren't tied to the OS setting, so read the page. */
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
  if (reduced || !container?.isConnected) return mutate();

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

// ---------- shared scraping helpers ----------

/** Text lines of an element, trimmed, without empties or the given name. */
export function textLines(el: HTMLElement, name: string): string[] {
  return (el.innerText || el.textContent || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== name && !/^sponsored$/i.test(line));
}

/** Polls until `find` returns something, or gives up after `ms`. */
export async function waitFor<T>(find: () => T | null | undefined, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 250));
  }
}
