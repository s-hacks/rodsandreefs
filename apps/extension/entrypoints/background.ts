import { API_PATHS, type RankRequest, type RankResponse } from '@rodsandreefs/shared';
import { API_BASE_URL } from '@/utils/config';
import type { BackgroundMessage, BackgroundReply, PageStats } from '@/utils/messages';

// Content scripts can't call our API directly (page CORS), so they message us.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
    if (message?.type === 'stats') {
      if (sender.tab?.id != null) void setBadge(sender.tab.id, message.payload);
      return;
    }
    if (message?.type !== 'rank') return;
    rank(message.payload)
      .then((data) => sendResponse({ ok: true, data } satisfies BackgroundReply))
      .catch((err) => {
        console.error('[shop-local] rank failed', err);
        sendResponse({ ok: false, error: String(err) } satisfies BackgroundReply);
      });
    // Keep the channel open for the async sendResponse (required in Chrome).
    return true;
  });
});

/** Shows the number of local shops found on the toolbar icon for that tab. */
async function setBadge(tabId: number, stats: PageStats) {
  try {
    // Firefox builds are MV2, where the toolbar API is `browserAction`.
    const action = browser.action ?? browser.browserAction;
    const text = stats.status === 'error' ? '!' : stats.local > 0 ? String(stats.local) : '';
    await action.setBadgeBackgroundColor({
      tabId,
      color: stats.status === 'error' ? '#b3261e' : '#1f7a4d',
    });
    await action.setBadgeText({ tabId, text });
  } catch {
    // The tab closed before we could update it.
  }
}

async function rank(payload: RankRequest): Promise<RankResponse> {
  const res = await fetch(`${API_BASE_URL}${API_PATHS.rank}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`rank API failed: ${res.status}`);
  return res.json();
}
