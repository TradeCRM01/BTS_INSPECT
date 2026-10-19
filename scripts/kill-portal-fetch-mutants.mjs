import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FETCH = resolve('src/lib/clientPortalFetch.ts');
const original = readFileSync(FETCH, 'utf8');

const MUTANTS = [
  {
    name: 'C drop error-body read',
    find: `        if (typeof body?.error === 'string' && body.error.trim()) {
          bodyError = body.error.trim();
        }`,
    replace: `        bodyError = null;`,
  },
  {
    name: 'D restore 4xx retry',
    find: `  if (error.status != null && error.status >= 500) return true;
  return false;`,
    replace: `  if (error.status != null && error.status >= 400) return true;
  return true;`,
  },
];

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function itLine(title) {
  const src = readFileSync(resolve('src/lib/clientPortalFetch.test.ts'), 'utf8');
  const needle = `it('${title}'`;
  const idx = src.indexOf(needle);
  if (idx < 0) return null;
  return src.slice(0, idx).split('\n').length;
}

function parseKill(output) {
  const plain = stripAnsi(output);
  const fail = [...plain.matchAll(/FAIL\s+(src\/lib\/clientPortalFetch\.test\.ts) > client portal token errors > (.+)/g)];
  if (fail.length === 0) return [];
  const name = fail[0][2].trim();
  const line = itLine(name);
  const loc = line ? `src/lib/clientPortalFetch.test.ts:${line}` : `${fail[0][1]}`;
  return [{ loc, name }];
}

function runTests() {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', 'src/lib/clientPortalFetch.test.ts', '--maxWorkers=1'],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

const lines = [
  '| Mutant | Applied | Verdict | Killed by |',
  '| --- | --- | --- | --- |',
];

try {
  for (const mutant of MUTANTS) {
    if (!original.includes(mutant.find)) {
      lines.push(`| ${mutant.name} | NO find string | SURVIVED | - |`);
      continue;
    }
    writeFileSync(FETCH, original.replace(mutant.find, mutant.replace));
    const result = runTests();
    writeFileSync(FETCH, original);
    if (result.ok) {
      lines.push(`| ${mutant.name} | yes | SURVIVED | - |`);
      continue;
    }
    const kills = parseKill(result.output);
    const first = kills[0];
    const killed = first
      ? `${first.name} (${first.loc})`
      : 'FAILED but parse missed file:line';
    lines.push(`| ${mutant.name} | yes | KILLED | ${killed} |`);
    if (!first) {
      console.error(stripAnsi(result.output).slice(-2500));
    }
  }
} finally {
  writeFileSync(FETCH, original);
}

console.log(lines.join('\n'));
