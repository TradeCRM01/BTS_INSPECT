import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const manifestPath = [
  resolve(root, 'manifest.webmanifest'),
  resolve(root, 'manifest.json'),
].find((p) => existsSync(p));

if (!manifestPath) {
  console.error('NO_MANIFEST');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const maskable = icons.filter((i) => String(i.purpose || '').includes('maskable'));
const any192 = icons.some((i) => String(i.sizes || '').includes('192'));
const any512 = icons.some((i) => String(i.sizes || '').includes('512'));
const displayOk = ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display);
const files = icons.map((i) => {
  const rel = String(i.src || '').replace(/^\//, '');
  const path = resolve(root, rel);
  return { src: i.src, purpose: i.purpose, sizes: i.sizes, exists: existsSync(path) };
});
const favicon = existsSync(resolve(root, 'favicon.svg'));

const installable =
  Boolean(manifest.name || manifest.short_name) &&
  Boolean(manifest.start_url) &&
  displayOk &&
  any192 &&
  any512 &&
  maskable.length > 0 &&
  files.every((f) => f.exists);

const report = {
  manifestPath,
  name: manifest.name,
  short_name: manifest.short_name,
  start_url: manifest.start_url,
  display: manifest.display,
  theme_color: manifest.theme_color,
  background_color: manifest.background_color,
  icons,
  maskablePresent: maskable.length > 0,
  maskable,
  iconFiles: files,
  faviconSvgPresent: favicon,
  displayOk,
  installable,
  verdict: installable ? 'installable: maskable icon present' : 'NOT installable',
};

console.log(JSON.stringify(report, null, 2));
process.exit(installable ? 0 : 1);
