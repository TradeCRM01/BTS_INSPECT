import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jhaPersistStatus, planJhaDocumentWrite } from './jhaDocumentWrite';
import { take5SaveRow, type Take5WritePayload } from './take5DocumentWrite';
import { take5SignatureForSave } from './take5NextAction';
import { trimSafetySite } from './safetySite';

const COMPANY = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const TEMPLATE = '00000000-0000-4000-8000-0000000000cc';
const DOC = '00000000-0000-4000-8000-0000000000dd';
const TAKE5 = '00000000-0000-4000-8000-0000000000ee';
const DOC_WALK = '00000000-0000-4000-8000-0000000000f0';
const TAKE5_WALK = '00000000-0000-4000-8000-0000000000f1';

function findBin(name: string): string | null {
  const look = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  if (look.stdout.trim()) return look.stdout.trim();
  for (const dir of ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin']) {
    const candidate = `${dir}/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

describe('jha_documents writes on real Postgres (migration 020)', () => {
  let dataDir = '';
  let sockDir = '';
  let psql = '';
  let pgCtl = '';
  let initdb = '';
  let started = false;

  function runSql(sql: string) {
    const result = spawnSync(psql, [
      '-h', sockDir,
      '-p', '55432',
      '-U', 'grafter',
      '-d', 'grafter',
      '-v', 'ON_ERROR_STOP=1',
      '-c', sql,
    ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
    }
    return result.stdout;
  }

  beforeAll(async () => {
    initdb = findBin('initdb') ?? '';
    pgCtl = findBin('pg_ctl') ?? '';
    psql = findBin('psql') ?? '';
    if (!initdb || !pgCtl || !psql) {
      throw new Error('Need local Postgres initdb/pg_ctl/psql for this proof');
    }
    const root = mkdtempSync(join(tmpdir(), 'grafter-pg-'));
    dataDir = join(root, 'pgdata');
    sockDir = join(root, 'sock');
    mkdirSync(sockDir, { recursive: true });
    const init = spawnSync(initdb, ['-D', dataDir, '-U', 'grafter', '--no-instructions', '-A', 'trust'], {
      encoding: 'utf8',
    });
    if (init.status !== 0) throw new Error(init.stderr || init.stdout);
    writeFileSync(join(dataDir, 'postgresql.conf'), `listen_addresses = ''
port = 55432
unix_socket_directories = '${sockDir}'
`);
    const start = spawnSync(pgCtl, ['-D', dataDir, '-l', join(dataDir, 'pg.log'), 'start'], { encoding: 'utf8' });
    if (start.status !== 0) throw new Error(start.stderr || start.stdout || readFileSync(join(dataDir, 'pg.log'), 'utf8'));
    started = true;
    spawnSync(psql, ['-h', sockDir, '-p', '55432', '-U', 'grafter', '-d', 'postgres', '-c', 'CREATE DATABASE grafter'], {
      encoding: 'utf8',
    });

    runSql(`
      DO $$ BEGIN
        CREATE ROLE authenticated;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${USER}'::uuid $$;
    `);
    const companies = readFileSync('supabase/migrations/20260426023532_001_companies_and_profiles.sql', 'utf8');
    const tables = readFileSync('supabase/migrations/20260803092510_020_jha_templates_and_documents_tables.sql', 'utf8');
    const take5Sql = readFileSync('supabase/migrations/20260813111445_jha_p3_ecosystem.sql', 'utf8');
    runSql(companies.replace(/REFERENCES auth\.users\(id\)[^,]*/g, ''));
    runSql(tables);
    runSql(take5Sql);
    runSql(`
      ALTER TABLE jha_documents DISABLE ROW LEVEL SECURITY;
      ALTER TABLE jha_templates DISABLE ROW LEVEL SECURITY;
      ALTER TABLE jha_take5 DISABLE ROW LEVEL SECURITY;
      INSERT INTO companies (id, name) VALUES ('${COMPANY}', 'QA Co');
      INSERT INTO profiles (id, email, name, company_id) VALUES ('${USER}', 'qa@example.com', 'QA', '${COMPANY}');
      INSERT INTO jha_templates (id, company_id, created_by, name) VALUES ('${TEMPLATE}', '${COMPANY}', '${USER}', 'Iso');
    `);
  }, 60_000);

  afterAll(() => {
    if (started && pgCtl && dataDir) {
      spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'immediate'], { encoding: 'utf8' });
    }
    const root = dataDir ? join(dataDir, '..') : '';
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('first save, second save, and a list-opened save keep one row', () => {
    const payload = {
      meta: { siteName: 'Plant A' },
      steps: [],
      ppe: [],
      sign_offs: [],
      status: 'draft' as const,
      client_id: null,
      job_id: null,
      doc_version: 1,
      amended_from_id: null,
      amendment_reason: null,
    };
    const first = planJhaDocumentWrite({
      persistedId: null,
      clientDraftId: DOC,
      templateId: TEMPLATE,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: COMPANY,
      createdBy: USER,
      payload,
    });
    expect(first.op).toBe('insert');
    const insertCols = ['id', 'template_id', 'template_snapshot', 'company_id', 'created_by', 'status', 'meta', 'steps', 'ppe', 'sign_offs'];
    const insertSql = `INSERT INTO jha_documents (${insertCols.join(',')}) VALUES (${insertCols.map(col => sqlLiteral(first.row[col])).join(',')})`;
    runSql(insertSql);

    const second = planJhaDocumentWrite({
      persistedId: DOC,
      clientDraftId: DOC,
      templateId: null,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: COMPANY,
      createdBy: USER,
      payload: { ...payload, meta: { siteName: 'Plant B' } },
    });
    expect(second.op).toBe('update');
    const updateCols = ['status', 'meta', 'steps', 'ppe', 'sign_offs'];
    runSql(`UPDATE jha_documents SET ${updateCols.map(col => `${col} = ${sqlLiteral(second.row[col])}`).join(', ')} WHERE id = '${DOC}'`);

    const listed = planJhaDocumentWrite({
      persistedId: DOC,
      clientDraftId: DOC,
      templateId: null,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: COMPANY,
      createdBy: USER,
      payload: { ...payload, meta: { siteName: 'From list' } },
    });
    expect(listed.op).toBe('update');
    const listCols = ['status', 'meta', 'steps', 'ppe', 'sign_offs'];
    runSql(`UPDATE jha_documents SET ${listCols.map(col => `${col} = ${sqlLiteral(listed.row[col])}`).join(', ')} WHERE id = '${DOC}'`);

    const firstCount = runSql(`SELECT count(*) FROM jha_documents`);
    expect(firstCount).toMatch(/\b1\b/);
    const site = runSql(`SELECT meta->>'siteName' FROM jha_documents WHERE id = '${DOC}'`);
    expect(site).toContain('From list');

    const upsertFails = spawnSync(psql, [
      '-h', sockDir, '-p', '55432', '-U', 'grafter', '-d', 'grafter',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `INSERT INTO jha_documents (id, status) VALUES ('${DOC}', 'draft') ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
    ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
    expect(upsertFails.status).not.toBe(0);
    expect(`${upsertFails.stderr}${upsertFails.stdout}`).toMatch(/template_id/);
    const stillOne = runSql(`SELECT count(*) FROM jha_documents WHERE id = '${DOC}'`);
    expect(stillOne).toMatch(/1/);
  });

  it('draft save on an existing Take 5 keeps one row and persists signature, location, and signer', () => {
    const jhaPlan = planJhaDocumentWrite({
      persistedId: null,
      clientDraftId: DOC,
      templateId: TEMPLATE,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: COMPANY,
      createdBy: USER,
      payload: {
        meta: { siteName: 'Board face' },
        steps: [],
        ppe: [],
        sign_offs: [],
        status: 'draft',
        client_id: null,
        job_id: null,
        doc_version: 1,
        amended_from_id: null,
        amendment_reason: null,
      },
    });
    if (jhaPlan.op === 'insert') {
      const insertCols = ['id', 'template_id', 'template_snapshot', 'company_id', 'created_by', 'status', 'meta', 'steps', 'ppe', 'sign_offs'];
      try {
        runSql(`INSERT INTO jha_documents (${insertCols.join(',')}) VALUES (${insertCols.map(col => sqlLiteral(jhaPlan.row[col])).join(',')})`);
      } catch (err) {
        if (!String(err).includes('duplicate key')) throw err;
      }
    }

    runSql(`
      INSERT INTO jha_take5 (id, company_id, jha_document_id, created_by, status, meta)
      VALUES ('${TAKE5}', '${COMPANY}', '${DOC}', '${USER}', 'draft', '{}'::jsonb)
    `);

    const location = trimSafetySite('  Cupboard face  ');
    const signature = take5SignatureForSave({
      canvasDataUrl: 'data:image/png;base64,take5sig',
      existingSignature: null,
    });
    const persistAs = jhaPersistStatus('draft', 'draft');
    const signedName = 'Jane Spark';
    runSql(`
      UPDATE jha_take5
      SET status = ${sqlLiteral(persistAs)},
          meta = ${sqlLiteral({ location })},
          signature = ${sqlLiteral(signature)},
          signed_name = ${sqlLiteral(signedName)}
      WHERE id = '${TAKE5}'
    `);

    const count = runSql(`SELECT count(*) FROM jha_take5 WHERE jha_document_id = '${DOC}'`);
    expect(count).toMatch(/\b1\b/);
    const row = runSql(`SELECT signature, signed_name, meta->>'location' AS location FROM jha_take5 WHERE id = '${TAKE5}'`);
    expect(row).toContain('data:image/png;base64,take5sig');
    expect(row).toContain('Jane Spark');
    expect(row).toContain('Cupboard face');
  });

  it('first Take 5 save, second save, and a list-opened save keep one row', () => {
    const parent = planJhaDocumentWrite({
      persistedId: null,
      clientDraftId: DOC_WALK,
      templateId: TEMPLATE,
      templateName: 'Iso',
      schema: { meta: {} },
      companyId: COMPANY,
      createdBy: USER,
      payload: {
        meta: { siteName: 'Walk face' },
        steps: [],
        ppe: [],
        sign_offs: [],
        status: 'draft',
        client_id: null,
        job_id: null,
        doc_version: 1,
        amended_from_id: null,
        amendment_reason: null,
      },
    });
    const insertCols = ['id', 'template_id', 'template_snapshot', 'company_id', 'created_by', 'status', 'meta', 'steps', 'ppe', 'sign_offs'];
    runSql(`INSERT INTO jha_documents (${insertCols.join(',')}) VALUES (${insertCols.map(col => sqlLiteral(parent.row[col])).join(',')})`);

    const basePayload: Take5WritePayload = {
      company_id: COMPANY,
      jha_document_id: DOC_WALK,
      created_by: USER,
      status: jhaPersistStatus('draft', 'draft'),
      meta: { location: trimSafetySite('  Board 4  '), date: '2026-10-19', time: '09:00', crewSignOns: '' },
      stop_think: 'Isolate',
      identify_hazards: 'Live',
      assess_risk: 'High',
      control_actions: 'Lock out',
      go_no_go: 'go',
      signed_name: 'Jane Spark',
      signature: take5SignatureForSave({
        canvasDataUrl: 'data:image/png;base64,take5sig',
        existingSignature: null,
      }),
      signed_at: null,
      updated_at: '2026-10-19T09:00:00.000Z',
    };

    const upsert = (row: Record<string, unknown>) => {
      const cols = Object.keys(row);
      const insert = `INSERT INTO jha_take5 (${cols.join(',')}) VALUES (${cols.map(col => sqlLiteral(row[col])).join(',')})`;
      const set = cols.filter(col => col !== 'id').map(col => `${col} = EXCLUDED.${col}`).join(', ');
      runSql(`${insert} ON CONFLICT (id) DO UPDATE SET ${set}`);
    };

    const first = take5SaveRow(TAKE5_WALK, basePayload);
    upsert(first);

    const second = take5SaveRow(TAKE5_WALK, {
      ...basePayload,
      meta: { ...basePayload.meta, location: trimSafetySite('  Board 4 face  ') },
      signature: take5SignatureForSave({
        canvasDataUrl: 'data:image/png;base64,take5sig2',
        existingSignature: String(first.signature ?? ''),
      }),
      updated_at: '2026-10-19T09:01:00.000Z',
    });
    expect(Object.keys(second)).toEqual(Object.keys(first));
    upsert(second);

    const listed = take5SaveRow(TAKE5_WALK, {
      ...basePayload,
      meta: { ...basePayload.meta, location: 'From list' },
      signature: take5SignatureForSave({
        canvasDataUrl: null,
        existingSignature: String(second.signature ?? ''),
      }),
      updated_at: '2026-10-19T09:02:00.000Z',
    });
    expect(Object.keys(listed)).toEqual(Object.keys(first));
    upsert(listed);

    const count = runSql(`SELECT count(*) FROM jha_take5 WHERE id = '${TAKE5_WALK}'`);
    expect(count).toMatch(/\b1\b/);
    const saved = runSql(`SELECT signature, signed_name, meta->>'location' AS location FROM jha_take5 WHERE id = '${TAKE5_WALK}'`);
    expect(saved).toContain('From list');
    expect(saved).toContain('Jane Spark');
    expect(saved).toContain('data:image/png;base64,take5sig2');
  });
});
