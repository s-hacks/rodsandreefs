import { API_PATHS, type RankRequest, type RankResponse } from '@rodsandreefs/shared';
import { API_BASE_URL } from '@/utils/config';

export type BackgroundMessage = { type: 'rank'; payload: RankRequest };

// Content scripts can't call our API directly (page CORS), so they message us.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundMessage) => {
    if (message?.type !== 'rank') return;
    return rank(message.payload);
  });
});

async function rank(payload: RankRequest): Promise<RankResponse> {
  const res = await fetch(`${API_BASE_URL}${API_PATHS.rank}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`rank API failed: ${res.status}`);
  return res.json();
}
