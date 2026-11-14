import { useEffect, useRef, useState } from 'react';
import { cityItem, enabledItem, totalItem } from '@/utils/config';
import type { ContentMessage, PageStats } from '@/utils/messages';

/** `null` means the active tab isn't a Google results page (no content script). */
async function fetchStats(): Promise<PageStats | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return null;
    const message: ContentMessage = { type: 'get-stats' };
    return ((await browser.tabs.sendMessage(tab.id, message)) as PageStats | undefined) ?? null;
  } catch {
    return null;
  }
}

export default function App() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stats, setStats] = useState<PageStats | null>(null);
  const [city, setCity] = useState('');
  const [total, setTotal] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    enabledItem.getValue().then(setEnabled);
    cityItem.getValue().then(setCity);
    totalItem.getValue().then(setTotal);
    // The keyboard shortcut and new searches change these while we're open.
    const unwatch = [enabledItem.watch(setEnabled), totalItem.watch(setTotal)];
    // The page updates live after a toggle, so keep the numbers fresh.
    let alive = true;
    const poll = () => fetchStats().then((s) => alive && setStats(s));
    poll();
    const timer = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(timer);
      unwatch.forEach((fn) => fn());
    };
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await enabledItem.setValue(next);
  }

  // Saving re-ranks the open page, so wait until typing pauses.
  function editCity(value: string) {
    setCity(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void cityItem.setValue(value.trim()), 700);
  }

  const on = enabled === true;

  return (
    <main className={on ? 'popup on' : 'popup'}>
      <header className="hero">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            ★
          </span>
          <div>
            <h1>Shop Local</h1>
            <p>Independent shops first.</p>
          </div>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={on}
          aria-label="Boost local businesses"
          onClick={toggle}
          disabled={enabled === null}
        >
          <span className="knob" />
        </button>
      </header>

      <section className="body">
        <Status enabled={enabled} stats={stats} />
      </section>

      <label className="city" htmlFor="city">
        <span>Your city</span>
        <input
          id="city"
          type="text"
          value={city}
          placeholder="e.g. Tuscaloosa, AL"
          autoComplete="address-level2"
          spellCheck={false}
          onChange={(e) => editCity(e.target.value)}
          onBlur={() => {
            clearTimeout(saveTimer.current);
            void cityItem.setValue(city.trim());
          }}
        />
        <small>Only used when the search page doesn't show a location.</small>
      </label>

      <footer>
        {total > 0 && (
          <p className="total">
            <strong key={total}>★ {total.toLocaleString()}</strong> local{' '}
            {total === 1 ? 'pick' : 'picks'} lifted so far
          </p>
        )}
        <p>
          {on ? 'Applies instantly.' : 'Flip the switch to put locals on top.'} Toggle anywhere
          with <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>L</kbd>
        </p>
      </footer>
    </main>
  );
}

function Status({ enabled, stats }: { enabled: boolean | null; stats: PageStats | null }) {
  if (enabled === null) return <p className="note"> </p>;
  if (!enabled) {
    return <p className="note">Paused. You're seeing Google's usual order, chains and all.</p>;
  }
  if (!stats) {
    return <p className="note">Search on Google or DuckDuckGo and local shops will rise to the top.</p>;
  }
  if (stats.status === 'error') {
    return (
      <p className="note error">
        Can't reach the Shop Local server. Start it with <code>npm run dev:web</code>, then reload
        the page.
      </p>
    );
  }
  if (stats.status === 'loading') return <p className="note pulse">Finding local shops…</p>;
  if (stats.status === 'off' || (stats.local === 0 && stats.demoted === 0 && stats.ads === 0)) {
    return <p className="note">Nothing to reorder on this search.</p>;
  }

  return (
    <>
      <div className="stats">
        <Stat value={stats.local} label={stats.local === 1 ? 'local result' : 'local results'} primary />
        <Stat value={stats.demoted} label="pushed down" />
        <Stat value={stats.ads} label={stats.ads === 1 ? 'ad block hidden' : 'ad blocks hidden'} />
      </div>
      {stats.location && <p className="where">Near {stats.location}</p>}
    </>
  );
}

function Stat({ value, label, primary }: { value: number; label: string; primary?: boolean }) {
  return (
    <div className={primary ? 'stat primary' : 'stat'}>
      {/* Re-keyed so the number pops whenever it changes. */}
      <strong key={value}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
