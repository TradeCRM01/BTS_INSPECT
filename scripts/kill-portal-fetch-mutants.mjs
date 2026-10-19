import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FILES = {
  fetch: resolve('src/lib/clientPortalFetch.ts'),
  page: resolve('src/pages/ClientPortalPublicPage.tsx'),
  fetchTest: resolve('src/lib/clientPortalFetch.test.ts'),
  pageTest: resolve('src/pages/ClientPortalPublicPage.token.test.tsx'),
};

const snapshots = {
  fetch: readFileSync(FILES.fetch, 'utf8'),
  page: readFileSync(FILES.page, 'utf8'),
};

const MUTANTS = [
  {
    name: 'C drop error-body read',
    file: 'fetch',
    testFile: 'src/lib/clientPortalFetch.test.ts',
    testSrc: FILES.fetchTest,
    vitest: ['src/lib/clientPortalFetch.test.ts'],
    find: `        if (typeof body?.error === 'string' && body.error.trim()) {
          bodyError = body.error.trim();
        }`,
    replace: `        bodyError = null;`,
  },
  {
    name: 'D restore 4xx retry in shouldRetryPortalQuery',
    file: 'fetch',
    testFile: 'src/lib/clientPortalFetch.test.ts',
    testSrc: FILES.fetchTest,
    vitest: ['src/lib/clientPortalFetch.test.ts'],
    find: `  if (error.status != null && error.status >= 500) return true;
  return false;`,
    replace: `  if (error.status != null && error.status >= 400) return true;
  return true;`,
  },
  {
    name: 'E restore retry: 1 on the /p page',
    file: 'page',
    testFile: 'src/pages/ClientPortalPublicPage.token.test.tsx',
    testSrc: FILES.pageTest,
    vitest: ['src/pages/ClientPortalPublicPage.token.test.tsx'],
    find: 'retry: shouldRetryPortalQuery',
    replace: 'retry: 1',
  },
];

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function itLine(srcPath, title) {
  const src = readFileSync(srcPath, 'utf8');
  const needles = [`it('${title}'`, `it("${title}"`];
  for (const needle of needles) {
    const idx = src.indexOf(needle);
    if (idx >= 0) return src.slice(0, idx).split('\n').length;
  }
  return null;
}

function parseKill(output, testFile, testSrc) {
  const plain = stripAnsi(output);
  const fail = [...plain.matchAll(new RegExp(`FAIL\\s+${testFile.replace(/\./g, '\\.')} > .* > (.+)`, 'g'))];
  if (fail.length === 0) return [];
  const name = fail[0][1].trim();
  const line = itLine(testSrc, name);
  const loc = line ? `${testFile}:${line}` : testFile;
  return [{ loc, name }];
}

function runTests(files) {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', ...files, '--maxWorkers=1'],
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
    const original = snapshots[mutant.file];
    if (!original.includes(mutant.find)) {
      lines.push(`| ${mutant.name} | NO find string | SURVIVED | - |`);
      continue;
    }
    writeFileSync(FILES[mutant.file], original.replace(mutant.find, mutant.replace));
    const result = runTests(mutant.vitest);
    writeFileSync(FILES[mutant.file], original);
    if (result.ok) {
      lines.push(`| ${mutant.name} | yes | SURVIVED | - |`);
      continue;
    }
    const kills = parseKill(result.output, mutant.testFile, mutant.testSrc);
    const first = kills[0];
    const killed = first
      ? `${first.name} (${first.loc})`
      : 'FAILED but parse missed file:line';
    lines.push(`| ${mutant.name} | yes | KILLED | ${killed} |`);
    if (!first) console.error(stripAnsi(result.output).slice(-2500));
  }
} finally {
  writeFileSync(FILES.fetch, snapshots.fetch);
  writeFileSync(FILES.page, snapshots.page);
}

console.log(lines.join('\n'));
