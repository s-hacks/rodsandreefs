// The public install page. The zips in /public are built by `npm run release`.
const steps = [
  { title: "Download and unzip", body: "Unzip it anywhere. Keep the folder; the browser loads from it." },
  { title: "Open extensions", body: "Go to chrome://extensions (or edge://extensions) and turn on Developer mode, top right." },
  { title: "Load unpacked", body: "Click “Load unpacked” and pick the unzipped folder. Pin the ★ from the puzzle-piece menu." },
  { title: "Search", body: "Try “coffee shop” or “bookstore” on Google or DuckDuckGo. Local shops rise to the top." },
];

const features = [
  { icon: "★", title: "Locals on top", body: "Independent shops are badged and moved up. Chains, marketplaces and directories go down." },
  { icon: "⌖", title: "Local picks panel", body: "Nearby independents with their own website and one-tap directions." },
  { icon: "⎋", title: "One switch", body: "Flip it off and the page goes back exactly as it was. Or press Alt Shift L." },
  { icon: "◌", title: "Private", body: "No account and no tracking. Works on DuckDuckGo, which never sees your location." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-[#f6f8f6] text-[#1f2a24] dark:bg-[#111613] dark:text-[#e6ece8]">
      <header className="bg-gradient-to-br from-[#24935c] to-[#0f3d28] px-4 pb-20 pt-16 text-white sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/20 text-2xl" aria-hidden>
              ★
            </span>
            <span className="text-lg font-semibold">Local Look</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Search like normal. Find the shop down the street first.
          </h1>
          <p className="max-w-xl text-lg text-white/85">
            A free browser extension that puts local, independent businesses at the top of Google and
            DuckDuckGo, ahead of the chains and directories.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/local-look-chrome.zip"
              download
              className="rounded-full bg-white px-6 py-3 text-center font-semibold text-[#0f3d28] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              Download for Chrome, Edge, Brave
            </a>
            <a
              href="/local-look-firefox.zip"
              download
              className="rounded-full border border-white/40 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/10"
            >
              Firefox version
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-10 flex w-full max-w-4xl flex-col gap-12 px-4 pb-20 sm:px-8">
        <section className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#18201b]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-[#e9f5ee] text-[#1f7a4d] dark:bg-[#16291f] dark:text-[#6fd39c]" aria-hidden>
                  {f.icon}
                </span>
                <h2 className="font-semibold">{f.title}</h2>
              </div>
              <p className="text-sm leading-6 text-[#5f6b64] dark:text-[#a3aea8]">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-2xl font-bold tracking-tight">Install in a minute</h2>
          <ol className="grid gap-4 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-8 flex-none place-items-center rounded-full bg-[#1f7a4d] text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm leading-6 text-[#5f6b64] dark:text-[#a3aea8]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-sm text-[#5f6b64] dark:text-[#a3aea8]">
            <strong>Firefox:</strong> open <code>about:debugging</code> → This Firefox → “Load Temporary
            Add-on” and pick the zip. It stays until Firefox restarts. Phones don’t support extensions.
          </p>
        </section>
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-sm text-[#5f6b64] dark:border-white/10 dark:text-[#a3aea8]">
        Built at a hackathon by team rodsandreefs.
      </footer>
    </div>
  );
}
