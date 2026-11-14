import { useEffect, useState } from 'react';
import { enabledItem } from '@/utils/config';

export default function App() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    enabledItem.getValue().then(setEnabled);
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await enabledItem.setValue(next);
  }

  return (
    <main className="popup">
      <h1>Shop Local</h1>
      <p>Boost locally owned businesses to the top of your searches.</p>
      <button
        className={enabled ? 'toggle on' : 'toggle'}
        onClick={toggle}
        disabled={enabled === null}
      >
        {enabled ? 'On' : 'Off'}
      </button>
      <small>Changes apply on your next search.</small>
    </main>
  );
}
