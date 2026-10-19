#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMap, parseTokenBlocks } from './repoint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const htmlPath = resolve(ROOT, 'dist/index.html');
let html;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch {
  fail(`missing ${htmlPath}; run npm run build first`);
}

const scriptIdx = html.search(/<script(?![^>]*type=["']module["'])[^>]*>[\s\S]*?allowDark\s*=\s*false/);
if (scriptIdx < 0) fail('dist/index.html has no inline theme-init with allowDark = false');

const sheet = html.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/i);
if (!sheet) fail('dist/index.html has no stylesheet link');
const sheetIdx = html.indexOf(sheet[0]);
if (!(scriptIdx < sheetIdx)) {
  fail(`inline theme-init at ${scriptIdx} is not before stylesheet at ${sheetIdx}`);
}

if (!/followSystem\s*=\s*false/.test(html)) fail('followSystem = false missing from dist/index.html');
if (!/grafter-theme/.test(html)) fail('grafter-theme storage key missing from dist/index.html');

const assetsDir = resolve(ROOT, 'dist/assets');
const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
if (cssFiles.length === 0) fail('no CSS in dist/assets');
const bundled = cssFiles.map((f) => readFileSync(resolve(assetsDir, f), 'utf8')).join('\n');

const map = loadMap();
const tokensCss = readFileSync(resolve(ROOT, map.tokensFile), 'utf8');
const { light, dark } = parseTokenBlocks(tokensCss);
if (light.size < 59) fail(`expected 59 Light tokens, parsed ${light.size}`);
for (const name of light.keys()) {
  if (!bundled.includes(name)) fail(`built CSS missing ${name}`);
}
if (!bundled.includes('[data-theme=dark]') && !bundled.includes('[data-theme="dark"]')) {
  fail('built CSS missing [data-theme=dark] block');
}
if (dark.size < 30) fail(`dark block too small: ${dark.size} tokens`);

console.log('a0-repoint check-dist ok');
