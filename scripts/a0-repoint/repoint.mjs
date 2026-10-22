#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

export function loadMap(mapPath = resolve(HERE, 'map.json')) {
  return JSON.parse(readFileSync(mapPath, 'utf8'));
}

export function parseTokenBlocks(tokensCss) {
  const stripped = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = new Map();
  const dark = new Map();
  const blockRe = /([^{]+)\{([^}]+)\}/g;
  let m;
  while ((m = blockRe.exec(stripped))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    const body = m[2];
    const dest = sel.includes('[data-theme="dark"]') ? dark : light;
    const declRe = /(--g-[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let d;
    while ((d = declRe.exec(body))) {
      dest.set(d[1], d[2].trim());
    }
  }
  return { light, dark };
}

export function lightValueForToken(tokensCss, token) {
  return parseTokenBlocks(tokensCss).light.get(token) ?? null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyRepoints(css, map, tokensCss) {
  const issues = [];
  let next = css;
  let replacements = 0;

  if (!next.startsWith(map.importLine)) {
    if (next.includes(map.importLine)) {
      issues.push({
        type: 'import-not-first',
        detail: 'tokens import exists but is not line 1',
      });
    } else {
      next = `${map.importLine}\n${next}`;
      replacements += 1;
    }
  }

  for (const font of map.fonts ?? []) {
    const tokenVal = lightValueForToken(tokensCss, font.token);
    if (tokenVal) {
      const fromVal = font.from.replace(/^font-family:\s*/, '').trim();
      if (fromVal !== tokenVal) {
        issues.push({
          type: 'literal-mismatch',
          property: font.from,
          from: fromVal,
          token: font.token,
          light: tokenVal,
        });
      }
    }
    if (next.includes(font.from)) {
      next = next.split(font.from).join(font.to);
      replacements += 1;
    }
  }

  for (const entry of map.repoints) {
    // S2 moved Light off the A0 leftover hexes. map.from stays the pre-S2
    // literal so leftover detection still works; Light lives in tokens.css.
    const re = new RegExp(
      `(?<![-\\w])(${escapeRe(entry.property)})(\\s*:\\s*)([^;]+)`,
      'g',
    );
    next = next.replace(re, (full, prop, colon, raw) => {
      const value = raw.trim();
      if (value === entry.from) {
        replacements += 1;
        return `${prop}${colon}${entry.to}`;
      }
      if (value === entry.to) return full;
      if (/^var\(--g-[a-z0-9-]+\)$/.test(value) && value !== entry.to) {
        issues.push({
          type: 'hand-edited',
          property: prop,
          value,
          expected: entry.to,
        });
      }
      return full;
    });
  }

  return { css: next, replacements, issues };
}

export function leftoverRepoints(css, map) {
  const leftover = [];
  for (const entry of map.repoints) {
    const re = new RegExp(
      `(?<![-\\w])${escapeRe(entry.property)}\\s*:\\s*${escapeRe(entry.from)}\\s*;`,
    );
    if (re.test(css)) leftover.push(entry);
  }
  for (const font of map.fonts ?? []) {
    if (css.includes(font.from)) leftover.push(font);
  }
  const hasImport = css.startsWith(map.importLine);
  return { leftover, hasImport };
}

export function checkCss(css, map, tokensCss) {
  const applied = applyRepoints(css, map, tokensCss);
  const left = leftoverRepoints(applied.css, map);
  const errors = [
    ...applied.issues.map((i) => {
      if (i.type === 'hand-edited') {
        return `hand-edited re-point ${i.property}: ${i.value} (expected ${i.expected})`;
      }
      if (i.type === 'literal-mismatch') {
        return `map from ${i.from} != Light ${i.token} ${i.light} (${i.property})`;
      }
      return `${i.type}: ${i.detail ?? i.property}`;
    }),
  ];
  if (applied.replacements > 0) {
    errors.push(`${applied.replacements} declaration(s) still left to re-point`);
  }
  if (!left.hasImport) errors.push('missing tokens import as line 1');
  if (left.leftover.length > 0) {
    errors.push(`${left.leftover.length} mapped literal(s) still present`);
  }
  return { ok: errors.length === 0, errors, applied };
}

function parseArgs(argv) {
  const args = { check: false, css: null, map: null, tokens: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--css') args.css = argv[++i];
    else if (a === '--map') args.map = argv[++i];
    else if (a === '--tokens') args.tokens = argv[++i];
  }
  return args;
}

export function runCli(argv = process.argv.slice(2), io = { log: console.log, err: console.error }) {
  const args = parseArgs(argv);
  const map = loadMap(args.map ? resolve(args.map) : undefined);
  const cssPath = resolve(ROOT, args.css ?? map.cssFile);
  const tokensPath = resolve(ROOT, args.tokens ?? map.tokensFile);
  const css = readFileSync(cssPath, 'utf8');
  const tokensCss = readFileSync(tokensPath, 'utf8');

  if (args.check) {
    const result = checkCss(css, map, tokensCss);
    if (!result.ok) {
      for (const e of result.errors) io.err(e);
      return 1;
    }
    io.log('a0-repoint --check ok');
    return 0;
  }

  const applied = applyRepoints(css, map, tokensCss);
  if (applied.issues.length > 0) {
    for (const i of applied.issues) io.err(JSON.stringify(i));
    return 1;
  }
  if (applied.css !== css) writeFileSync(cssPath, applied.css);
  io.log(`a0-repoint wrote ${applied.replacements} change(s) to ${cssPath}`);
  const verify = checkCss(applied.css, map, tokensCss);
  if (!verify.ok) {
    for (const e of verify.errors) io.err(e);
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(runCli());
