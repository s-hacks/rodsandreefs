# CLAUDE.md

@apps/web/AGENTS.md

## Context

This is a **hackathon project** (team repo: `s-hacks/rodsandreefs`).

Hackathon priorities, in order:
1. **A working demo.** Something that runs end-to-end beats something half-built and elegant.
2. **Speed of iteration.** Prefer the simplest approach that works. No premature abstraction, no over-engineering.
3. **Looks good on stage.** The demo is judged visually, so polish the main user flow, not the edge cases.

When trade-offs come up, pick the fast path and mention it briefly rather than asking. Ask only when a choice would be expensive to undo (data model, auth provider, external paid services).

## Project

**Goal:** help people support local businesses without changing how they shop. Search engines push national chains, big-box retailers, online megastores and directories (Yelp, etc.) to the top, so independent local shops get buried. We fix that at the moment someone is deciding where to spend money.

**Description:** a browser extension with an on/off toggle. When it's on, it rewrites the search results page so locally owned, independent businesses near the user come first and are clearly badged as "Local". Chains, marketplaces and aggregators are pushed down.

- **Example:** in Tuscaloosa, searching "fishing tackle shop" should put Crimson Pride Hunting & Fishing and Woods & Water at the top, not Academy Sports.
- **Scope:** any business type, any sector, any US location. Nothing hard-coded to one city or category in the real logic.
- **Search engine:** Google first. Others later, if time allows.
- **Demo flow (draft):** search with the extension off and see chains on top → toggle it on → same search, local shops on top with badges.

### What the Google results page actually looks like

From a real search ("fishing tackle shop" in Birmingham, AL), top to bottom:
1. **Places / map pack.** Google already lists local shops here, but it mixes in a **sponsored chain** (e.g. Bass Pro).
2. **Organic links.** These are mostly aggregators and chains (Yelp "Top 10", Walmart, Tackle Warehouse (online only), Reddit). Often **none** of them is a local shop.
3. **Sponsored ads** (Cabela's, etc.).
4. **"In stores nearby" product carousel.** Entirely chains (Walmart, Academy, Dick's, Bass Pro).

Reordering organic links alone won't deliver the demo. The highest-impact targets are probably the Places pack (badge independents, demote or hide sponsored chains) and the product carousel (demote chain products), plus surfacing local shops that aren't in the organic links at all.

### Deciding "local" (the core hard problem)

- Current logic in `apps/web/src/app/api/rank/route.ts` is a `// DEMO:` placeholder. It counts any domain not on a small chain/aggregator blocklist as local, so it wrongly boosts online-only retailers like Tackle Warehouse.
- Real signals to use: a physical location near the user (Google Places / Yelp API), whether the same business name has many locations (chain detection), and whether it's a directory or marketplace rather than a business.
- User location: infer it from the query text ("in tuscaloosa"), the "Birmingham, AL" location Google shows on the page, or the user's IP or browser geolocation.

### Current status

- Pipeline works: content script → background worker → `/api/rank` → reorder and badge. It's verified in Chrome against a local replica of a results page, but **not yet verified on a live Google page** (Google blocks automated browsers, so check by hand).
- Classification lives in `apps/web/src/lib/classify.ts` and needs no API key: businesses in the Places pack are near the user already, and chains are detected with ~5,500 US brand names from OpenStreetMap's Name Suggestion Index (`src/data/chains.json`, regenerate with `scripts/build-chains.mjs`). Organic links are local only with positive evidence (matches an independent place, or names the user's city); otherwise they're left alone.
- Handled: organic links, the Places pack (badge, chains sunk), sponsored blocks (collapsed), plus an injected "Local picks" panel. The toggle applies live and reverts the page exactly.
- **Search engines:** Google (`entrypoints/google.content.ts`) and DuckDuckGo (`entrypoints/duckduckgo.content.ts`, verified live). Each only scrapes its own markup. All page changes live in `utils/engine.ts`. DuckDuckGo shows no location, but its map module (Apple Maps, located from the IP and not stored) loads a few seconds late, and the script re-runs when it appears. To add an engine, write a new `*.content.ts` that returns a `Scrape`.
- **City:** taken from the page, then from a city named in the query, then from the "Your city" box in the popup (`cityItem`).
- The Places pack and ad selectors in `SELECTORS` are from memory of Google's markup. If the picks panel doesn't appear on a live page, those are the first thing to fix.
- For debugging, open DevTools on the results page and filter the console by `[shop-local]` to see results found, the API reply and boosted results.
- WXT's dev server is pinned to port 3001. On its default (3000) it shadowed the API on `localhost` and every rank call returned 404.

## Architecture

npm workspaces monorepo:

```
apps/extension/    Browser extension (WXT + React + TS, Manifest V3)
apps/web/          Next.js app: the backend API (+ landing page later)
packages/shared/   TypeScript types for the extension <-> API contract
```

How a search flows:
1. `apps/extension/entrypoints/google.content/` (**content script**) runs on `google.com/search`, scrapes the organic results, and messages the background worker.
2. `apps/extension/entrypoints/background.ts` (**background service worker**) POSTs them to the API. It does the fetch because content scripts are bound by the page's CORS rules, and the extension's `host_permissions` let the background worker skip them.
3. `apps/web/src/app/api/rank/route.ts` decides which results are local and returns `{ id, isLocal, reason }` for each.
4. The content script moves the local results to the top and adds a badge.
5. `apps/extension/entrypoints/popup/` is the toolbar popup with an on/off toggle, stored via `enabledItem` in `apps/extension/utils/config.ts`.

Key rules:
- **API keys (Google Places, Yelp, etc.) live only in `apps/web`** (`.env.local`). Never put secrets in the extension: anyone can unzip it and read them.
- The request/response shapes live in `packages/shared/src/index.ts`. Change them there, and update both sides in the same commit.
- Google's DOM changes often. Keep all selectors in the `SELECTORS` object in the content script.
- The current "is local" logic is a `// DEMO:` chain-domain blocklist. Expect to replace it.

## Commands (run from repo root)

```bash
npm install          # installs all workspaces
npm run dev          # runs web (localhost:3000) + extension dev mode together
npm run dev:web      # API only
npm run dev:ext      # extension only (WXT opens a Chrome window with it loaded, hot-reloads)
npm run build        # builds both; the extension goes to apps/extension/.output/chrome-mv3
npm run build:browsers  # extension for Chrome (chrome-mv3), Firefox (firefox-mv2) and Edge (edge-mv3)
npm run dev:edge     # / dev:firefox: like dev:ext, but opens that browser
npm run typecheck    # tsc for both apps
npm run lint         # ESLint (web)
```

To load the built extension into your normal Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → pick `apps/extension/.output/chrome-mv3`.

## Stack notes

- **Extension:** [WXT](https://wxt.dev) (Vite-based extension framework). Entrypoints are file-based in `apps/extension/entrypoints/` (`*.content/`, `background.ts`, `popup/`). Manifest settings are in `apps/extension/wxt.config.ts`, not a hand-written manifest.json. Use `browser.*` APIs (WXT polyfill) and `storage` from `#imports`.
- **Web:** Next.js 16 (App Router, `src/` dir, Turbopack, React Compiler, Cache Components), React 19, TypeScript, Tailwind CSS v4 (config in CSS, no `tailwind.config.js`). This Next.js version is newer than most training data, so check `apps/web/node_modules/next/dist/docs/` (or `node_modules/next/dist/docs/` at root) before using an API you're unsure about.
- Package manager: **npm** only. Add dependencies to the right workspace: `npm install <pkg> -w apps/web`.

## Conventions

- Web: Server Components by default; `"use client"` only for interactive leaves. API endpoints go in `src/app/api/*/route.ts`. Import with `@/`.
- Extension: keep content scripts small and defensive. If something on the page isn't found, bail silently instead of breaking Google.
- Secrets go in `.env.local` (gitignored). Document new variables in the matching `.env.example`. Extension env vars must be prefixed `WXT_` and are **public**.
- Adding a dependency is fine when it saves real time, but say so and prefer well-known packages.
- If you hard-code demo data or fake a feature for the demo, mark it with `// DEMO:`.

## Working as a team

- Several people push to this repo at once. Keep commits small and focused, pull before starting work, and avoid sweeping reformatting or renames.
- Don't commit or push unless asked. Never force-push `main`.
- Before saying something is done, make sure `npm run build` and `npm run typecheck` pass.
