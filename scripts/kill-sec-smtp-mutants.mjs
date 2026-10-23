import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FILES = {
  client: resolve('src/lib/emailSmtpClient.ts'),
  migration: resolve('supabase/migrations/20261023120000_sec_smtp_pass_lock.sql'),
  settings: resolve('src/pages/CompanySettingsPage.tsx'),
};

const snapshots = Object.fromEntries(
  Object.entries(FILES).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
);

const MUTANTS = [
  {
    name: 'job/inspection/invoice select the secret column',
    file: 'client',
    testFile: 'src/lib/secSmtpPass.network.kill.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.network.kill.test.ts'),
    vitest: ['src/lib/secSmtpPass.network.kill.test.ts', '-t', 'job page as admin'],
    find: "export const EMAIL_SETTINGS_CLIENT_COLUMNS = 'smtp_host, from_name, from_email';",
    replace: "export const EMAIL_SETTINGS_CLIENT_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';",
  },
  {
    name: 'settings select the secret column',
    file: 'client',
    testFile: 'src/lib/secSmtpPass.network.kill.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.network.kill.test.ts'),
    vitest: ['src/lib/secSmtpPass.network.kill.test.ts', '-t', 'company settings as admin'],
    find: "export const EMAIL_SETTINGS_PUBLIC_COLUMNS =\n  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_name, from_email, created_at, updated_at';",
    replace: "export const EMAIL_SETTINGS_PUBLIC_COLUMNS =\n  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, created_at, updated_at';",
  },
  {
    name: 'authenticated can SELECT smtp_pass',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'denies smtp secret SELECT'],
    find: 'REVOKE SELECT ON public.email_settings FROM anon, authenticated;',
    replace: '-- mutant: keep table SELECT',
  },
  {
    name: 'RPC leaks company B when A asks',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'never company B state'],
    find: `  RETURN EXISTS (
    SELECT 1
      FROM public.email_settings e
     WHERE e.company_id = v_company`,
    replace: `  RETURN EXISTS (
    SELECT 1
      FROM public.email_settings e
     WHERE e.company_id IS NOT NULL`,
  },
  {
    name: 'admin can read the secret back after write',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'write-only updates'],
    find: `GRANT SELECT (
  id,
  company_id,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  from_name,
  from_email,
  created_at,
  updated_at
) ON public.email_settings TO authenticated;`,
    replace: 'GRANT SELECT ON public.email_settings TO authenticated;',
  },
  {
    name: 'dist ships the secret column name',
    file: 'client',
    testFile: 'src/lib/secSmtpPass.network.kill.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.network.kill.test.ts'),
    vitest: ['src/lib/secSmtpPass.network.kill.test.ts', '-t', 'production bundle'],
    find: "export const EMAIL_SMTP_READY_RPC = 'email_smtp_ready';",
    replace: "export const EMAIL_SMTP_READY_RPC = 'email_smtp_ready';\nexport const SMTP_SECRET_LEAK = 'smtp_pass';",
    rebuild: true,
  },
];

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function itLine(srcPath, title) {
  const src = readFileSync(srcPath, 'utf8');
  for (const needle of [`it('${title}'`, `it("${title}"`, title]) {
    const idx = src.indexOf(needle);
    if (idx >= 0) return src.slice(0, idx).split('\n').length;
  }
  return null;
}

function parseKill(output, testFile, testSrc) {
  const plain = stripAnsi(output);
  const fail = [...plain.matchAll(/FAIL\s+\S+\s+>\s+(?:.+\s+>\s+)?(.+)/g)];
  const name = fail[0]?.[1]?.trim();
  if (!name) return [];
  const line = itLine(testSrc, name.replace(/^\S+\s+>\s+/, '')) ?? itLine(testSrc, name);
  const loc = line ? `${testFile}:${line}` : testFile;
  return [{ loc, name }];
}

function runTests(args, rebuild) {
  if (rebuild && existsSync('dist')) {
    spawnSync('npx', ['vite', 'build'], { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' });
  }
  const result = spawnSync('npx', ['vitest', 'run', '--maxWorkers=1', ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

const lines = [
  '| Kill | it() | Mutant | Red line |',
  '| --- | --- | --- | --- |',
];

try {
  for (const mutant of MUTANTS) {
    const original = snapshots[mutant.file];
    if (!original.includes(mutant.find)) {
      lines.push(`| ${mutant.name} | ${mutant.testFile} | find missed | SURVIVED |`);
      continue;
    }
    writeFileSync(FILES[mutant.file], original.replace(mutant.find, mutant.replace));
    const result = runTests(mutant.vitest, mutant.rebuild);
    writeFileSync(FILES[mutant.file], original);
    if (mutant.rebuild) {
      spawnSync('npx', ['vite', 'build'], { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' });
    }
    if (result.ok) {
      lines.push(`| ${mutant.name} | ${mutant.testFile} | yes | SURVIVED |`);
      console.error(stripAnsi(result.output).slice(-2000));
      continue;
    }
    const kills = parseKill(result.output, mutant.testFile, mutant.testSrc);
    const first = kills[0];
    const red = [...stripAnsi(result.output).matchAll(/❯\s+([^\n]+:\d+:\d+)/g)][0]?.[1]
      ?? [...stripAnsi(result.output).matchAll(/at\s+\S+\s+\(([^)]+:\d+:\d+)\)/g)][0]?.[1]
      ?? 'assertion failed';
    lines.push(`| ${mutant.name} | ${first ? `${first.name} (${first.loc})` : mutant.testFile} | yes | ${red} |`);
  }
} finally {
  for (const [key, path] of Object.entries(FILES)) writeFileSync(path, snapshots[key]);
}

console.log(lines.join('\n'));
