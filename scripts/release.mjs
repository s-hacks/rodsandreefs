// Builds the installable zips and puts them on the download page
// (apps/web/public). Run `npm run release`, commit, then deploy the web app.
import { execSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ext = 'apps/extension';
const out = join(ext, '.output');
const run = (cmd) => execSync(cmd, { cwd: ext, stdio: 'inherit' });

run('npx wxt zip');
run('npx wxt zip -b firefox');

const files = readdirSync(out);
for (const [browser, target] of [
  ['chrome', 'local-look-chrome.zip'],
  ['firefox', 'local-look-firefox.zip'],
]) {
  // Firefox also gets a -sources.zip; take the extension itself.
  const zip = files.find((f) => f.endsWith(`-${browser}.zip`));
  if (!zip) throw new Error(`No ${browser} zip in ${out}`);
  copyFileSync(join(out, zip), join('apps/web/public', target));
  console.log(`${zip} -> apps/web/public/${target}`);
}
