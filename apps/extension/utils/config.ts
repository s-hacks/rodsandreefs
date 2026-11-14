import { storage } from '#imports';

/** Base URL of the web API (apps/web). Override at build time with WXT_API_BASE_URL. */
export const API_BASE_URL: string =
  import.meta.env.WXT_API_BASE_URL ?? 'http://localhost:3000';

/** Whether local boosting is on. Shared by popup, content script and background. */
export const enabledItem = storage.defineItem<boolean>('local:enabled', {
  fallback: true,
});
