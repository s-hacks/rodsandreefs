import { storage } from '#imports';

/** The deployed API on Vercel. Keep in sync with host_permissions in wxt.config.ts. */
export const PROD_API_URL = 'https://local-look.vercel.app';

/**
 * Base URL of the web API (apps/web). `npm run dev` talks to localhost; builds
 * (what people install) talk to Vercel. Override with WXT_API_BASE_URL.
 */
export const API_BASE_URL: string =
  import.meta.env.WXT_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000' : PROD_API_URL);

/** Whether local boosting is on. Shared by popup, content script and background. */
export const enabledItem = storage.defineItem<boolean>('local:enabled', {
  fallback: true,
});

/** Running count of local results surfaced, shown in the popup. */
export const totalItem = storage.defineItem<number>('local:total', {
  fallback: 0,
});

/** The user's city, e.g. "Tuscaloosa, AL". Used only when the page shows none. */
export const cityItem = storage.defineItem<string>('local:city', {
  fallback: '',
});
