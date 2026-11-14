# CLAUDE.md

@AGENTS.md

## Context

This is a **hackathon project** (team repo: `s-hacks/rodsandreefs`). The idea is not decided yet — update the "Project" section below as soon as it is.

Hackathon priorities, in order:
1. **A working demo.** Something that runs end-to-end beats something half-built and elegant.
2. **Speed of iteration.** Prefer the simplest approach that works. No premature abstraction, no over-engineering.
3. **Looks good on stage.** The demo is judged visually — polish the main user flow, not the edge cases.

When trade-offs come up, pick the fast path and mention it briefly rather than asking. Ask only when a choice would be expensive to undo (data model, auth provider, external paid services).

## Project

_TBD — fill in once the idea is chosen:_
- **One-liner:** what it does and for whom
- **Demo flow:** the 3–5 steps we'll show judges
- **Out of scope:** things we're deliberately not building

## Stack

- **Next.js 16** (App Router, `src/` dir, Turbopack, React Compiler, Cache Components enabled in [next.config.ts](next.config.ts))
- **React 19**, **TypeScript** (strict)
- **Tailwind CSS v4** — config lives in CSS (`@import "tailwindcss"` / `@theme` in [src/app/globals.css](src/app/globals.css)); there is no `tailwind.config.js`
- **ESLint** via `eslint-config-next`
- Package manager: **npm** (don't introduce yarn/pnpm/bun lockfiles)

This Next.js version is newer than most training data. Before using an API you're unsure about (caching, `use cache`, route handlers, server actions, `params`/`searchParams`, metadata), check `node_modules/next/dist/docs/` rather than guessing.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # production build — run before pushing anything significant
npm run lint    # ESLint
npx tsc --noEmit  # type-check
```

## Structure & conventions

- Routes live in `src/app/` (`page.tsx`, `layout.tsx`, `route.ts` for API endpoints).
- Shared components → `src/components/`, helpers/clients → `src/lib/`. Create these folders when first needed.
- Import with the `@/` alias (`@/components/Button`), not long relative paths.
- **Server Components by default.** Add `"use client"` only for components that need state, effects, or browser APIs — keep those as small leaf components.
- Prefer **Server Actions** for mutations and **route handlers** (`src/app/api/*/route.ts`) for endpoints called by external clients.
- Style with Tailwind utility classes; avoid separate CSS files except `globals.css`.
- Secrets go in `.env.local` (gitignored). Never commit keys. Only expose values to the browser via `NEXT_PUBLIC_*` when they are safe to be public. Add any new required variable to `.env.example` with a placeholder.
- Adding a dependency is fine when it saves real time (e.g. a UI kit, an SDK) — but say so, and prefer well-known packages.

## Working as a team

- Several people push to this repo at once. Keep commits small and focused, pull before starting work, and avoid sweeping reformatting or renames that cause merge conflicts.
- Don't commit or push unless asked. Never force-push `main`.
- Before saying something is done, make sure `npm run build` passes (or at minimum `npx tsc --noEmit` and `npm run lint`).
- If you hard-code demo data or fake a feature for the demo, mark it with `// DEMO:` so it's easy to find later.
