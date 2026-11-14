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

- **One-liner:** a browser extension that supports local businesses. When it's on, locally owned businesses are moved to the top of your search results. Example: searching "fishing tackle shop" in Tuscaloosa puts Crimson Pride Hunting & Fishing and Woods & Water above Academy Sports.
- **Scope:** any business type, any sector, any US location.
- **Demo flow:** _TBD_ (e.g. search with extension off → turn it on → same search shows local shops on top with a "Local" badge)
- **Open questions:** how we decide "local" (chain list? Places/Yelp data? ownership data?), how we get the user's location, and which search engines beyond Google.

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
