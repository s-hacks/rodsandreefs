import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Shop Local',
    description: 'Puts local businesses at the top of your search results.',
    permissions: ['storage'],
    // The background worker calls our API; a host permission avoids CORS issues.
    host_permissions: ['http://localhost:3000/*'],
  },
});
