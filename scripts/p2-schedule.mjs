#!/usr/bin/env node
// P2 Schedule proof driver. Needs Node 22.18+ so it can import the .ts matrix directly.
//   node scripts/p2-schedule.mjs scope                      mechanical scope checks against the base sha
//   node scripts/p2-schedule.mjs capture [--out DIR]        build, run the P2 kills, write frames, measure.json, tables.md
//   node scripts/p2-schedule.mjs mutants [--only a,b] [--out DIR]
// Mutants edit throwaway snapshots under the OS tmp dir and never the working tree. A mutant is killed
// only when its named it() reports a red assertion, inside that it(), that the unmutated snapshot lacks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_SHA, BASELINE_VITEST_LOG, MUTANTS, SCOPE, killTitle } from '../src/proof/p2Schedule/matrix.ts';
import { snapshotTree } from '../src/proof/p2Schedule/harness.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KILL_FILE = 'src/proof/p2Schedule/kill.ts';
const CONFIG = 'vitest.p2-schedule.config.ts';

const [command, ...rest] = process.argv.slice(2);
const flag = name => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
}
const must = (cmd, args, opts) => {
  const r = sh(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.out.slice(-4000)}`);
  return r;
};
const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function runKills(cwd, outFile, { title, env } = {}) {
  rmSync(outFile, { force: true });
  const args = ['vitest', 'run', '-c', CONFIG, '--reporter=json', `--outputFile=${outFile}`];
  if (title) args.push('-t', escapeRe(title));
  const r = sh('npx', args, { cwd, env: { ...process.env, ...env } });
  if (!existsSync(outFile)) throw new Error(`P2 kills wrote no report in ${cwd}:\n${r.out.slice(-4000)}`);
  const json = JSON.parse(readFileSync(outFile, 'utf8'));
  return json.testResults.flatMap(f => f.assertionResults);
}

/** Splits a vitest failure into its message line and the first kill.ts line in its stack. */
function parseFailure(text) {
  const message = text.split('\n')[0];
  const frame = text.match(new RegExp(`${escapeRe(KILL_FILE)}:(\\d+):\\d+`));
  return { message, line: frame ? Number(frame[1]) : null, assertion: message.startsWith('AssertionError') };
}

function scope() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });

  const changed = [...new Set([
    ...lines(must('git', ['diff', '--name-only', BASE_SHA]).stdout),
    ...lines(must('git', ['ls-files', '--others', '--exclude-standard']).stdout),
  ])].sort();
  const forbidden = changed.filter(f => SCOPE.forbidden.includes(f) || SCOPE.forbiddenDirs.some(d => f.startsWith(d)));
  check('no off-limits path differs from the base', forbidden.length === 0, forbidden);

  const outside = [];
  const cssDiff = must('git', ['diff', '-U0', BASE_SHA, '--', SCOPE.cssFile]).stdout;
  for (const m of cssDiff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    // A pure insertion (count 0) lands after base line `start`, so it may sit just before a range.
    const ok = count === 0
      ? SCOPE.cssBaseRanges.some(([a, b]) => start >= a - 1 && start <= b)
      : SCOPE.cssBaseRanges.some(([a, b]) => start >= a && start + count - 1 <= b);
    if (!ok) outside.push(`-${start},${count}`);
  }
  check(`${SCOPE.cssFile} hunks sit in base lines ${SCOPE.cssBaseRanges.map(r => r.join('-')).join(' and ')}`, outside.length === 0, outside);

  const { file, line, text } = SCOPE.exactLine;
  const working = readFileSync(join(ROOT, file), 'utf8').split('\n')[line - 1];
  const base = must('git', ['show', `${BASE_SHA}:${file}`]).stdout.split('\n')[line - 1];
  check(`${file}:${line} reads exactly as on the base`, working === text && base === text, { working, base });

  const tsc = sh('npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json']);
  const tscCount = (tsc.out.match(/error TS/g) ?? []).length;
  check(`tsc errors at most ${SCOPE.tscMax}`, tscCount <= SCOPE.tscMax, tscCount);

  must('npm', ['run', 'build']);
  const report = join(mkdtempSync(join(tmpdir(), 'p2-scope-')), 'vitest.json');
  sh('npx', ['vitest', 'run', '--maxWorkers=2', '--reporter=json', `--outputFile=${report}`]);
  const ran = JSON.parse(readFileSync(report, 'utf8')).testResults.map(f => ({ file: relative(ROOT, f.name), status: f.status }));
  const failing = ran.filter(f => f.status === 'failed').map(f => f.file).sort();
  const baseline = new Set([...readFileSync(BASELINE_VITEST_LOG, 'utf8').matchAll(/^ FAIL {2}(\S+)/gm)].map(m => m[1]));
  check(`no failing vitest file outside the ${baseline.size} in the base log`, failing.every(f => baseline.has(f)), {
    newFailures: failing.filter(f => !baseline.has(f)),
    failing,
  });
  for (const f of SCOPE.mustStayGreen) {
    const hit = ran.find(r => r.file === f);
    check(`${f} stays green`, hit?.status === 'passed', hit?.status ?? 'not run');
  }

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  ${JSON.stringify(r.detail)}`}`);
  console.log(`changed vs ${BASE_SHA.slice(0, 8)}: ${changed.join(', ')}`);
  return results.every(r => r.ok) ? 0 : 1;
}

function capture() {
  const out = resolve(flag('out') ?? join(tmpdir(), 'p2-proofs', 'after'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  must('npm', ['run', 'build']);
  const results = runKills(ROOT, join(out, 'kills.json'), { env: { P2_CAPTURE_DIR: out } });
  const verdicts = results.filter(a => a.status !== 'skipped').map(a => ({
    title: a.title,
    status: a.status,
    it: `${KILL_FILE}:${a.location?.line}`,
    red: a.failureMessages.length,
    first: a.failureMessages[0] ? parseFailure(a.failureMessages[0]) : null,
  }));
  const measurePath = join(out, 'measure.json');
  if (!existsSync(measurePath)) throw new Error(`capture wrote no ${measurePath}`);
  const measure = JSON.parse(readFileSync(measurePath, 'utf8'));
  measure.kills = verdicts;
  writeFileSync(measurePath, `${JSON.stringify(measure, null, 2)}\n`);
  const table = ['', '## Kills on this tree', '', '| kill | status | red assertions | first red |', '|---|---|---|---|',
    ...verdicts.map(v => `| ${v.title} | ${v.status} | ${v.red} | ${v.first ? `${KILL_FILE}:${v.first.line} ${v.first.message.replace(/\|/g, '/')}` : ''} |`)];
  writeFileSync(join(out, 'tables.md'), `${readFileSync(join(out, 'tables.md'), 'utf8')}${table.join('\n')}\n`);
  const missing = measure.frames.missingBeforeNames;
  console.log(`frames ${measure.frames.written.length} written, ${measure.frames.beforeNames.length} before names, missing ${missing.length ? missing.join(', ') : 'none'}`);
  for (const v of verdicts) console.log(`${v.status.padEnd(6)} ${v.title}${v.first ? `  first red ${v.first.message}` : ''}`);
  console.log(`wrote ${out}`);
  return missing.length || measure.failed.length ? 1 : 0;
}

/** Applies a mutant to file text. Throws unless the edit matches exactly once. */
function applyMutant(text, m) {
  const spans = [];
  if (m.rule) {
    for (let i = text.indexOf(m.rule); i >= 0; i = text.indexOf(m.rule, i + 1)) {
      const lineStart = text.lastIndexOf('\n', i) + 1;
      if (text.slice(lineStart, i).trim() !== '' || text[i + m.rule.length] !== '\n') continue;
      spans.push([i, text.indexOf('}', i)]);
    }
  } else {
    spans.push([0, text.length]);
  }
  const hits = [];
  for (const [a, b] of spans) {
    for (let i = text.indexOf(m.find, a); i >= 0 && i < b; i = text.indexOf(m.find, i + 1)) hits.push(i);
  }
  if (hits.length !== 1) throw new Error(`mutant ${m.id}: ${JSON.stringify(m.find)}${m.rule ? ` inside ${JSON.stringify(m.rule)}` : ''} matches ${hits.length} times in ${m.file}`);
  return text.slice(0, hits[0]) + m.replace + text.slice(hits[0] + m.find.length);
}

const sha = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'missing');
const guardHashes = () => Object.fromEntries(SCOPE.forbidden.map(f => [f, sha(join(ROOT, f))]));

function workingTree() {
  const index = join(mkdtempSync(join(tmpdir(), 'p2-index-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  must('git', ['read-tree', 'HEAD'], { env });
  must('git', ['add', '-A'], { env });
  const tree = must('git', ['write-tree'], { env }).stdout.trim();
  rmSync(dirname(index), { recursive: true, force: true });
  return tree;
}

function mutants() {
  const only = flag('only')?.split(',');
  const out = resolve(flag('out') ?? join(tmpdir(), 'p2-proofs', 'mutants'));
  const chosen = MUTANTS.filter(m => !only || only.includes(m.id));
  if (!chosen.length) throw new Error(`no mutant matches ${only}`);
  for (const m of chosen) applyMutant(readFileSync(join(ROOT, m.file), 'utf8'), m);

  mkdirSync(out, { recursive: true });
  const guardBefore = guardHashes();
  const tree = workingTree();
  const stem = join(tmpdir(), `p2-mut-${tree.slice(0, 12)}`);
  console.log(`tree ${tree} (working tree with untracked files)`);

  const baseDir = snapshotTree({ treeish: tree, dir: `${stem}-base` });
  const base = runKills(baseDir, join(out, 'base.json'));
  const itLines = base.map(a => a.location?.line).filter(Boolean).sort((a, b) => a - b);
  const baseRed = new Map(base.map(a => [a.title, new Set(a.failureMessages.map(f => parseFailure(f).message))]));
  console.log(`base: ${base.filter(a => a.status === 'failed').length} of ${base.length} kills red on the unmutated tree`);

  const report = [];
  for (const m of chosen) {
    const title = killTitle(m.kill);
    const dir = `${stem}-${m.id}`;
    const t0 = Date.now();
    let row;
    try {
      snapshotTree({ treeish: tree, dir, edit: root => writeFileSync(join(root, m.file), applyMutant(readFileSync(join(root, m.file), 'utf8'), m)) });
      const t1 = Date.now();
      const hit = runKills(dir, join(out, `${m.id}.json`), { title }).find(a => a.title === title);
      if (!hit) throw new Error(`no result for ${title}`);
      const itLine = hit.location?.line ?? null;
      const end = itLines.find(l => l > itLine) ?? Infinity;
      const known = baseRed.get(title) ?? new Set();
      const failures = hit.failureMessages.map(parseFailure);
      const fresh = failures.filter(f => f.assertion && f.line !== null && f.line >= itLine && f.line < end && !known.has(f.message));
      const verdict = hit.status === 'failed' && fresh.length ? 'killed' : failures.some(f => !f.assertion) ? 'error' : 'survived';
      row = {
        id: m.id, kill: m.kill, file: m.file, brief: m.brief, verdict,
        it: `${KILL_FILE}:${itLine}`,
        red: fresh[0] ? `${KILL_FILE}:${fresh[0].line}` : null,
        assertion: fresh[0]?.message ?? failures.find(f => !f.assertion)?.message ?? null,
        newRed: fresh.length, baseRed: known.size,
        buildS: Math.round((t1 - t0) / 1000), runS: Math.round((Date.now() - t1) / 1000),
      };
    } catch (err) {
      row = { id: m.id, kill: m.kill, file: m.file, brief: m.brief, verdict: 'error', assertion: String(err.message).split('\n')[0] };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    report.push(row);
    console.log(`${row.verdict.padEnd(8)} ${m.id} -> ${title}${row.red ? `  red ${row.red} ${row.assertion}` : row.assertion ? `  ${row.assertion}` : ''}`);
  }
  rmSync(baseDir, { recursive: true, force: true });

  const build = sh('npm', ['run', 'build']);
  const dist = join(ROOT, 'dist', 'index.html');
  const guardAfter = guardHashes();
  const touched = Object.keys(guardBefore).filter(f => guardBefore[f] !== guardAfter[f]);
  const summary = {
    base: BASE_SHA, tree, at: new Date().toISOString(),
    greenDist: build.code === 0 && existsSync(dist) && statSync(dist).mtimeMs > Date.now() - 10 * 60_000,
    offLimitsTouched: touched,
    mutants: report,
  };
  writeFileSync(join(out, 'mutants.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(out, 'mutants.md'), [
    `Tree ${tree}. Dist rebuilt green: ${summary.greenDist}. Off-limits files touched: ${touched.length ? touched.join(', ') : 'none'}.`,
    '', '| mutant | kill | verdict | it() | red assertion |', '|---|---|---|---|---|',
    ...report.map(r => `| ${r.id} (${r.brief}) | ${r.kill} | ${r.verdict} | ${r.it ?? ''} | ${r.red ? `${r.red} ${r.assertion.replace(/\|/g, '/')}` : (r.assertion ?? '').replace(/\|/g, '/')} |`),
  ].join('\n') + '\n');
  console.log(`green dist ${summary.greenDist}; off-limits touched ${touched.length}; wrote ${out}`);
  return report.every(r => r.verdict === 'killed') && summary.greenDist && !touched.length ? 0 : 1;
}

const commands = { scope, capture, mutants };
if (!commands[command]) {
  console.error('usage: node scripts/p2-schedule.mjs scope | capture [--out DIR] | mutants [--only a,b] [--out DIR]');
  process.exit(2);
}
process.exit(commands[command]());
