#!/usr/bin/env node
// Apply one real-file src mutant, rebuild, run the matching kill, revert.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MUTANTS } from '../src/proof/p2Schedule/matrix.ts';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('usage: node scripts/p2-r6-mutants.mjs <mutant-id>...');
  process.exit(2);
}

const OUT = '/opt/cursor/artifacts/p2-r6';
mkdirSync(OUT, { recursive: true });

const apply = (file, find, replace) => {
  const path = resolve(file);
  const src = readFileSync(path, 'utf8');
  if (!src.includes(find)) throw new Error(`find miss in ${file}: ${find.slice(0, 80)}`);
  writeFileSync(path, src.replace(find, replace));
  const line = src.slice(0, src.indexOf(find)).split('\n').length;
  return { path, line, change: `${find.replace(/\s+/g, ' ').slice(0, 120)} → ${replace.replace(/\s+/g, ' ').slice(0, 120)}` };
};

const assertionLine = (log) => {
  const lines = log.split('\n');
  const hits = lines.filter(l => /^\s*AssertionError:/.test(l) || l.includes('AssertionError:'));
  if (hits.length) return hits[0].trim();
  const fail = lines.find(l => /× |FAIL  |failed/.test(l) && /P2-|K\d+/.test(l));
  return (fail ?? '(no AssertionError line captured)').trim();
};

const rows = [];
for (const id of ids) {
  const spec = MUTANTS.find(m => m.id === id);
  if (!spec) throw new Error(`unknown mutant ${id}`);
  const before = readFileSync(resolve(spec.file), 'utf8');
  let applied;
  try {
    applied = apply(spec.file, spec.find, spec.replace);
    execSync('npm run build', { stdio: 'inherit' });
    let log = '';
    let code = 0;
    const filter = spec.kill === 'K25' ? 'K25:' : spec.kill === 'P2-overflow' ? 'P2-overflow' : spec.kill;
    try {
      log = execSync(
        `npx vitest run -c vitest.p2-schedule.config.ts -t ${JSON.stringify(filter)}`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TZ: 'UTC' } },
      );
    } catch (err) {
      code = err.status ?? 1;
      log = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    }
    writeFileSync(`${OUT}/mutant-${id}.log`, log);
    const itLine = log.split('\n').find(l => /src\/proof\/p2Schedule\/kill\.ts:\d+/.test(l))
      ?? log.split('\n').find(l => l.includes(spec.kill) && /× |FAIL/.test(l))
      ?? spec.kill;
    rows.push({
      id,
      kill: spec.kill,
      ok: code !== 0,
      src: `${spec.file}:${applied.line}`,
      change: spec.brief,
      exact: applied.change,
      red: assertionLine(log).slice(0, 320),
      it: itLine.trim().slice(0, 220),
    });
    console.log(JSON.stringify(rows[rows.length - 1], null, 2));
  } finally {
    writeFileSync(resolve(spec.file), before);
  }
}

execSync('npm run build', { stdio: 'inherit' });
writeFileSync(`${OUT}/mutants.json`, `${JSON.stringify(rows, null, 2)}\n`);
console.log(rows);
