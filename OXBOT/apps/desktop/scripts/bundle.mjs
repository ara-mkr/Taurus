// Bundles the main process, the preload and the Taurus server into dist/, so the packaged app
// runs plain JavaScript and never depends on Node's type stripping inside Electron.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(here, 'dist');
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
mkdirSync(out, { recursive: true });

const common = { bundle: true, platform: 'node', target: 'node22', legalComments: 'none', logLevel: 'warning', define: { __TAURUS_VERSION__: JSON.stringify(version) } };
await Promise.all([
  build({ ...common, entryPoints: [join(here, 'src/main.ts')], outfile: join(out, 'main.mjs'), format: 'esm', external: ['electron'] }),
  build({ ...common, entryPoints: [join(here, 'src/preload.ts')], outfile: join(out, 'preload.cjs'), format: 'cjs', external: ['electron'] }),
  // The swarm's overlay on other screens (November 5, 2026): a listen-only preload and a draw-only page.
  build({ ...common, entryPoints: [join(here, 'src/overlay-preload.ts')], outfile: join(out, 'overlay-preload.cjs'), format: 'cjs', external: ['electron'] }),
  build({ ...common, platform: 'browser', target: 'chrome130', entryPoints: [join(here, 'src/overlay.ts')], outfile: join(out, 'overlay.js'), format: 'iife' }),
  // Taurus in the notch (November 6, 2026): a narrow preload and the page that draws the pill and panel.
  build({ ...common, entryPoints: [join(here, 'src/notch-preload.ts')], outfile: join(out, 'notch-preload.cjs'), format: 'cjs', external: ['electron'] }),
  build({ ...common, platform: 'browser', target: 'chrome130', entryPoints: [join(here, 'src/notch-view.ts')], outfile: join(out, 'notch-view.js'), format: 'iife' }),
  // Taurus anywhere (November 16, 2026): a listen-only preload and the page that draws him over other apps.
  build({ ...common, entryPoints: [join(here, 'src/taurus-anywhere-preload.ts')], outfile: join(out, 'taurus-anywhere-preload.cjs'), format: 'cjs', external: ['electron'] }),
  build({ ...common, platform: 'browser', target: 'chrome130', entryPoints: [join(here, 'src/taurus-anywhere-view.ts')], outfile: join(out, 'taurus-anywhere.js'), format: 'iife' }),
  // Some of the server's dependencies are CommonJS and call require(). Playwright (Taurus's own browser) can't be
  // bundled: it ships alongside as a dependency and finds its Chromium in the usual Playwright folder. Kokoro (Taurus's
  // voice) loads its model runtime with native files, so it stays outside too; in the desktop app the voice is only
  // there when those packages are installed beside it.
  build({ ...common, entryPoints: [join(here, '../server/src/index.ts')], outfile: join(out, 'server.mjs'), format: 'esm', external: ['playwright-core', 'kokoro-js', '@huggingface/transformers', 'onnxruntime-node'], banner: { js: "import { createRequire as __taurusRequire } from 'node:module'; const require = __taurusRequire(import.meta.url);" } }),
]);
copyFileSync(join(here, 'src/overlay.html'), join(out, 'overlay.html'));
copyFileSync(join(here, 'src/notch.html'), join(out, 'notch.html'));
copyFileSync(join(here, 'src/taurus-anywhere.html'), join(out, 'taurus-anywhere.html'));
// The server reads Composio's app list from beside itself.
copyFileSync(join(here, '../server/src/connectors/composio-catalog.json'), join(out, 'composio-catalog.json'));
// Helpers in other apps (November 5, 2026): the fixed-verb taurus-hands program, built from hands/main.m with clang on a Mac.
if (process.platform === 'darwin') {
  try {
    execFileSync('clang', ['-fobjc-arc', '-O2', '-mmacosx-version-min=14.0', '-arch', 'arm64', '-arch', 'x86_64', '-o', join(out, 'taurus-hands'), join(here, 'hands/main.m'),
      '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'Carbon', '-framework', 'ScreenCaptureKit'], { stdio: 'inherit' });
  } catch { console.warn('taurus-hands was not built (no clang?). Helpers in other apps will be unavailable.'); }
}
// The native notch (November 17, 2026): copied beside main.mjs when apps/notch-mac/build.sh has built it. Not built
// here: without it the desktop app uses its Electron notch.
const notchBuild = join(here, '../notch-mac/.build/release');
if (process.platform === 'darwin' && existsSync(join(notchBuild, 'TaurusNotch'))) {
  for (const name of ['TaurusNotch', 'libOxNowPlaying.dylib']) if (existsSync(join(notchBuild, name))) copyFileSync(join(notchBuild, name), join(out, name));
}
for (const name of ['trayTemplate.png', 'trayTemplate@2x.png', 'tray.png', 'tray@2x.png']) copyFileSync(join(here, 'assets', name), join(out, name));
console.log('Bundled main, preload and server into apps/desktop/dist');
