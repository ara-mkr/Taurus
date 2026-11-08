// Generates every icon from design/logo/ox-mark.svg: the app icons (.icns, .ico, PNGs 16 to 1024),
// the menu bar template image and tray image, and the phone home-screen PNGs in apps/web/public/icons.
// Renders with Playwright's Chromium (already a dev dependency) and macOS iconutil. The mark is not
// trademark-cleared; fine for personal builds.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(here, '../..');
const assets = join(here, 'assets');
const webIcons = join(repo, 'apps/web/public/icons');
mkdirSync(assets, { recursive: true });
mkdirSync(webIcons, { recursive: true });

const mark = readFileSync(join(repo, 'design/logo/ox-mark.svg'), 'utf8').trim();
// The O and X strokes on their own, from the same file, for the monochrome and maskable versions.
const glyph = mark.match(/<g[\s\S]*<\/g>/)[0];
const svg = {
  // The tile as drawn.
  tile: mark,
  // macOS draws app icons on an 824/1024 body with room for the shadow.
  mac: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><g transform="translate(117 117) scale(.805)">${mark.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`,
  // Full-bleed square with the glyph inside the 80% safe circle, for Android's maskable icon.
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#141413"/><g transform="translate(180 180) scale(.7)">${glyph}</g></svg>`,
  // Black on transparent: macOS tints template images for light and dark menu bars.
  template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 330 1080 540">${glyph.replace('stroke="#F7F6F3"', 'stroke="#000"')}</svg>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(source, width, height = width) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${width}px;height:${height}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}">`);
  await page.locator('img').evaluate(img => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

// App icons.
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const tiles = {};
for (const size of sizes) { tiles[size] = await png(svg.tile, size); writeFileSync(join(assets, `icon-${size}.png`), tiles[size]); }
writeFileSync(join(assets, 'icon.png'), tiles[1024]);

// macOS .icns through an .iconset.
const iconset = join(assets, 'icon.iconset');
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset);
for (const size of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${size}x${size}.png`), await png(svg.mac, size));
  writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), await png(svg.mac, size * 2));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(assets, 'icon.icns')]);
rmSync(iconset, { recursive: true, force: true });

// Windows .ico: a directory of PNG images (Vista and later read PNG entries).
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((size, i) => {
  const at = 6 + 16 * i, data = tiles[size];
  header.writeUInt8(size >= 256 ? 0 : size, at); header.writeUInt8(size >= 256 ? 0 : size, at + 1);
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += data.length;
});
writeFileSync(join(assets, 'icon.ico'), Buffer.concat([header, ...icoSizes.map(size => tiles[size])]));

// Menu bar (template, 16 pt) and the Windows and Linux tray (the tile reads on light and dark taskbars).
writeFileSync(join(assets, 'trayTemplate.png'), await png(svg.template, 32, 16));
writeFileSync(join(assets, 'trayTemplate@2x.png'), await png(svg.template, 64, 32));
writeFileSync(join(assets, 'tray.png'), tiles[16]);
writeFileSync(join(assets, 'tray@2x.png'), tiles[32]);

// Phone: apple-touch-icon is a full square (iOS rounds the corners itself), plus 192, 512 and a 512 maskable.
writeFileSync(join(webIcons, 'apple-touch-icon.png'), await png(svg.maskable.replace('scale(.7)', 'scale(.8)').replace('translate(180 180)', 'translate(120 120)'), 180));
writeFileSync(join(webIcons, 'icon-192.png'), await png(svg.tile, 192));
writeFileSync(join(webIcons, 'icon-512.png'), await png(svg.tile, 512));
writeFileSync(join(webIcons, 'icon-512-maskable.png'), await png(svg.maskable, 512));

await browser.close();
console.log('Icons written to apps/desktop/assets and apps/web/public/icons');
