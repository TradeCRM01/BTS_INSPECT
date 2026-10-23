import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FILES = {
  client: resolve('src/lib/emailSmtpClient.ts'),
  reminder: resolve('src/lib/jobReminder.ts'),
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
    find: "export const EMAIL_SETTINGS_PUBLIC_COLUMNS =\n  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_name, from_email, created_at, updated_at';",
    replace: "export const EMAIL_SETTINGS_PUBLIC_COLUMNS =\n  'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, created_at, updated_at';",
    rebuild: true,
  },
  {
    name: 'save upserts the secret then selects (PostgREST)',
    file: 'client',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'real PostgREST client path'],
    find: '  const payload = { ...publicPayload };',
    replace: '  const payload = { ...publicPayload, smtp_pass: String(secretDraft ?? \'\') };',
  },
  {
    name: 'save upserts the secret then selects (Settings)',
    file: 'client',
    testFile: 'src/lib/secSmtpPass.network.kill.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.network.kill.test.ts'),
    vitest: ['src/lib/secSmtpPass.network.kill.test.ts', '-t', 'saves and rotates the SMTP password on Settings'],
    find: '  const payload = { ...publicPayload };',
    replace: '  const payload = { ...publicPayload, smtp_pass: String(secretDraft ?? \'\') };',
  },
  {
    name: 'email_smtp_ready takes a company argument',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'takes no arguments on email_smtp_ready'],
    edits: [
      {
        find: 'CREATE OR REPLACE FUNCTION public.email_smtp_ready()',
        replace: 'CREATE OR REPLACE FUNCTION public.email_smtp_ready(p_company uuid DEFAULT NULL)',
      },
      {
        find: 'ON FUNCTION public.email_smtp_ready()',
        replace: 'ON FUNCTION public.email_smtp_ready(uuid)',
        all: true,
      },
    ],
  },
  {
    name: 'drop search_path on email_smtp_ready',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'pins search_path'],
    find: `STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.id = auth.uid();`,
    replace: `STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.id = auth.uid();`,
  },
  {
    name: 'emailSettingsReady fails open without a secret',
    file: 'reminder',
    testFile: 'src/lib/secSmtpPass.client.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.client.test.ts'),
    vitest: ['src/lib/secSmtpPass.client.test.ts', '-t', 'fails closed when host and from'],
    find: '  if (secret === undefined) return false;',
    replace: '  if (secret === undefined) return true;',
  },
  {
    name: 'setter drops the admin check',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'denies a crew member calling email_smtp_set_pass'],
    find: '  IF v_company IS NULL OR NOT COALESCE(v_admin, false) THEN',
    replace: '  IF v_company IS NULL THEN',
  },
  {
    name: 'setter takes a company argument',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'email_smtp_set_pass takes only p_pass'],
    edits: [
      {
        find: 'CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)',
        replace: 'CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text, p_company uuid DEFAULT NULL)',
      },
      {
        find: 'ON FUNCTION public.email_smtp_set_pass(text)',
        replace: 'ON FUNCTION public.email_smtp_set_pass(text, uuid)',
        all: true,
      },
    ],
  },
  {
    name: 'setter drops the auth.uid company lookup',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'email_smtp_set_pass writes only the caller company'],
    find: `  SELECT p.company_id, (p.role = 'admin')
    INTO v_company, v_admin
    FROM public.profiles p
   WHERE p.id = auth.uid();`,
    replace: `  SELECT p.company_id, (p.role = 'admin')
    INTO v_company, v_admin
    FROM public.profiles p
   WHERE p.role = 'admin'
   ORDER BY p.company_id DESC
   LIMIT 1;`,
  },
  {
    name: 'setter drops SECURITY DEFINER',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'pins SECURITY DEFINER on email_smtp_set_pass'],
    find: `CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp`,
    replace: `CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp`,
  },
  {
    name: 'setter drops search_path',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'pins search_path on email_smtp_set_pass'],
    find: `CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$`,
    replace: `CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$`,
  },
  {
    name: 'setter grants EXECUTE to anon',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'revokes PUBLIC and anon execute on email_smtp_set_pass'],
    find: 'GRANT EXECUTE ON FUNCTION public.email_smtp_set_pass(text) TO authenticated;',
    replace: `GRANT EXECUTE ON FUNCTION public.email_smtp_set_pass(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.email_smtp_set_pass(text) TO PUBLIC;`,
  },
  {
    name: 'setter wipes on empty password',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'rejects empty or null email_smtp_set_pass'],
    find: `  IF btrim(coalesce(p_pass, '')) = '' THEN
    RAISE EXCEPTION 'password required'
      USING ERRCODE = '22023';
  END IF;
`,
    replace: '',
  },
  {
    name: 'anon keeps table DML after drop REVOKE ALL',
    file: 'migration',
    testFile: 'src/lib/secSmtpPass.pg.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.pg.test.ts'),
    vitest: ['src/lib/secSmtpPass.pg.test.ts', '-t', 'denies anon INSERT UPDATE DELETE TRUNCATE'],
    find: 'REVOKE ALL ON public.email_settings FROM anon;',
    replace: '-- mutant: keep default anon table DML',
  },
  {
    name: 'Settings set indicator follows row existence',
    file: 'settings',
    testFile: 'src/lib/secSmtpPass.network.kill.test.ts',
    testSrc: resolve('src/lib/secSmtpPass.network.kill.test.ts'),
    vitest: ['src/lib/secSmtpPass.network.kill.test.ts', '-t', 'shows not-set when a settings row exists'],
    find: '    setSmtpSecretSet(ready === true);',
    replace: '    setSmtpSecretSet(Boolean(data));',
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

function applyMutant(original, mutant) {
  const edits = mutant.edits ?? [{ find: mutant.find, replace: mutant.replace, all: mutant.all }];
  let next = original;
  for (const edit of edits) {
    if (!next.includes(edit.find)) return null;
    next = edit.all ? next.split(edit.find).join(edit.replace) : next.replace(edit.find, edit.replace);
  }
  return next;
}

try {
  for (const mutant of MUTANTS) {
    const original = snapshots[mutant.file];
    const next = applyMutant(original, mutant);
    if (!next) {
      lines.push(`| ${mutant.name} | ${mutant.testFile} | find missed | SURVIVED |`);
      continue;
    }
    writeFileSync(FILES[mutant.file], next);
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
      ?? [...stripAnsi(result.output).matchAll(/(src\/\S+\.(?:ts|tsx):\d+:\d+)/g)].at(-1)?.[1]
      ?? 'assertion failed';
    lines.push(`| ${mutant.name} | ${first ? `${first.name} (${first.loc})` : mutant.testFile} | yes | ${red} |`);
  }
} finally {
  for (const [key, path] of Object.entries(FILES)) writeFileSync(path, snapshots[key]);
}

console.log(lines.join('\n'));
