import type { RankResponse, SearchResult } from '@rodsandreefs/shared';
import type { BackgroundMessage } from '@/entrypoints/background';
import { enabledItem } from '@/utils/config';
import './style.css';

// Google's DOM changes often. Keep every selector in this one place.
const SELECTORS = {
  resultsContainer: '#rso',
  resultLink: 'a:has(h3)',
  resultTitle: 'h3',
};

export default defineContentScript({
  matches: ['*://*.google.com/search*'],
  runAt: 'document_idle',
  async main() {
    if (!(await enabledItem.getValue())) return;

    const query = new URLSearchParams(location.search).get('q');
    const container = document.querySelector<HTMLElement>(SELECTORS.resultsContainer);
    if (!query || !container) return;

    const blocks = collectResults(container);
    if (blocks.length === 0) return;

    const message: BackgroundMessage = {
      type: 'rank',
      payload: { query, results: blocks.map((b) => b.result) },
    };
    const response: RankResponse = await browser.runtime.sendMessage(message);
    const byId = new Map(response.results.map((r) => [r.id, r]));

    // Move local results to the top, preserving their relative order.
    const local = blocks.filter((b) => byId.get(b.result.id)?.isLocal);
    for (const block of [...local].reverse()) {
      block.el.classList.add('rr-local');
      block.el.dataset.rrReason = byId.get(block.result.id)?.reason ?? 'Local business';
      container.prepend(block.el);
    }
  },
});

interface ResultBlock {
  el: HTMLElement;
  result: SearchResult;
}

/** Finds top-level organic result blocks (direct children of the results container). */
function collectResults(container: HTMLElement): ResultBlock[] {
  const blocks: ResultBlock[] = [];
  for (const el of Array.from(container.children) as HTMLElement[]) {
    const link = el.querySelector<HTMLAnchorElement>(SELECTORS.resultLink);
    const title = link?.querySelector(SELECTORS.resultTitle)?.textContent;
    if (!link?.href || !title) continue;
    try {
      const url = new URL(link.href);
      blocks.push({
        el,
        result: {
          id: String(blocks.length),
          url: url.href,
          title,
          domain: url.hostname.replace(/^www\./, ''),
        },
      });
    } catch {
      // Skip malformed hrefs.
    }
  }
  return blocks;
}
