import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Shop Local',
    description: 'Puts local businesses at the top of your search results.',
    permissions: ['storage'],
    // The background worker calls our API; a host permission avoids CORS issues.
    host_permissions: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*'],
  },
  // WXT's dev server defaults to port 3000, the same as the web app. With both
  // running, "localhost:3000" reached WXT instead of the API and every rank
  // call returned 404. Keep WXT off that port.
  dev: {
    server: { port: 3001 },
  },
  // `npm run dev` opens a fresh Chrome profile with the extension loaded.
  // Start it on a demo search instead of about:blank.
  webExt: {
    startUrls: ['https://www.google.com/search?q=fishing+tackle+shop+tuscaloosa'],
  },
});
