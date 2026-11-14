import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Shop Local',
    description: 'Puts local businesses at the top of your search results.',
    permissions: ['storage'],
    // The background worker calls our API; a host permission avoids CORS issues.
    host_permissions: [
      'http://localhost:3000/*',
      'http://127.0.0.1:3000/*',
      // A deployed API: build with WXT_API_BASE_URL=https://your-app.vercel.app
      ...(process.env.WXT_API_BASE_URL
        ? [`${new URL(process.env.WXT_API_BASE_URL).origin}/*`]
        : []),
    ],
    // Toggle from any page, handy on stage.
    commands: {
      'toggle-local': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Turn Shop Local on or off',
      },
    },
    // Firefox wants a stable ID (storage) and a data-collection statement.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'shop-local@rodsandreefs',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
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
