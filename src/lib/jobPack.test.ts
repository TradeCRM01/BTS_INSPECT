import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_PACK_ADD,
  JOB_PACK_ADD_PLACEHOLDER,
  JOB_PACK_FIRST_TICK,
  JOB_PACK_GROUPS,
  JOB_PACK_NO_JOB,
  JOB_PACK_NOT_SIGNED_IN,
  JOB_PACK_PACKED,
  JOB_PACK_TABLE,
  JOB_PACK_TEMPLATES,
  JOB_PACK_TITLE,
  JOB_PACK_TRADES_HELP,
  JOB_PACK_TRADES_LABEL,
  applyJobPackTick,
  decideJobPackAddItem,
  decideJobPackStart,
  decideJobPackTick,
  groupJobPackItems,
  jobPackItemsQuery,
  jobPackProgress,
  jobPackTemplate,
  jobPackTickPatch,
  jobPackTray,
  parseCompanyTrades,
  resolveJobPackTemplate,
  templateJobPackRows,
  type JobPackItem,
} from './jobPack';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function item(over: Partial<JobPackItem> & { id: string; position: number }): JobPackItem {
  return {
    company_id: 'co-1',
    job_id: 'job-1',
    pack_key: 'plumbing',
    group_key: 'tools',
    label: `Item ${over.id}`,
    ticked_at: null,
    ticked_by: null,
    ticked_by_name: null,
    created_by: 'p-sam',
    created_at: '2026-09-11T08:00:00.000Z',
    ...over,
  };
}

const signedIn = { jobId: 'job-1', companyId: 'co-1', userId: 'p-sam' };

describe('JOB_PACK_TEMPLATES', () => {
  it('seeds one pack per trade, plumbing first and general last', () => {
    expect(JOB_PACK_TEMPLATES.map(t => t.key)).toEqual(['plumbing', 'electrical', 'hvac', 'carpentry', 'general']);
    expect(JOB_PACK_TEMPLATES.map(t => t.label)).toEqual(['Plumbing', 'Electrical', 'HVAC and mechanical', 'Carpentry', 'General']);
    expect(jobPackTemplate('hvac')?.label).toBe('HVAC and mechanical');
    expect(jobPackTemplate('roofing')).toBe(null);
  });

  it('gives every pack all four groups with at least two items each', () => {
    for (const template of JOB_PACK_TEMPLATES) {
      for (const group of JOB_PACK_GROUPS) {
        expect(template.items[group.key].length, `${template.key}.${group.key}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(JOB_PACK_GROUPS.map(g => g.key)).toEqual(['tools', 'materials', 'photos', 'safety']);
  });

  it('keeps the locked words out of the pack copy', () => {
    const lib = src('src/lib/jobPack.ts');
    expect(lib).not.toMatch(/Relovi|Littleloop|ute photos/i);
    for (const template of JOB_PACK_TEMPLATES) {
      for (const group of JOB_PACK_GROUPS) {
        for (const label of template.items[group.key]) {
          expect(label).not.toMatch(/Relovi|Littleloop|ute photos/i);
        }
      }
    }
    expect([JOB_PACK_TITLE, JOB_PACK_PACKED, JOB_PACK_ADD, JOB_PACK_ADD_PLACEHOLDER, JOB_PACK_FIRST_TICK, JOB_PACK_TRADES_LABEL, JOB_PACK_TRADES_HELP])
      .toEqual(['Job pack', 'Packed', 'Add item', 'Add an item', 'Saves from the first tick.', 'Trades', 'First pick is the primary trade. Job packs load it.']);
    expect(lib).not.toContain('JOB_PACK_EMPTY');
    expect(lib).not.toContain('JOB_PACK_PICK');
  });
});

describe('parseCompanyTrades', () => {
  it('keeps known keys in the order set and drops unknowns and repeats', () => {
    expect(parseCompanyTrades(['hvac', 'plumbing', 'hvac', 'roofing', 7])).toEqual(['hvac', 'plumbing']);
  });

  it('reads anything that is not an array as no trades', () => {
    expect(parseCompanyTrades(null)).toEqual([]);
    expect(parseCompanyTrades('electrical')).toEqual([]);
  });
});

describe('resolveJobPackTemplate', () => {
  it('loads electrical with no chooser when the company has no trades', () => {
    const { template, choices } = resolveJobPackTemplate([], null);
    expect(template.key).toBe('electrical');
    expect(choices).toEqual([]);
  });

  it('loads the only trade with a single choice', () => {
    const { template, choices } = resolveJobPackTemplate(['plumbing'], null);
    expect(template.key).toBe('plumbing');
    expect(choices.map(t => t.key)).toEqual(['plumbing']);
  });

  it('treats the first trade as primary and offers every company trade', () => {
    const { template, choices } = resolveJobPackTemplate(['hvac', 'plumbing'], null);
    expect(template.key).toBe('hvac');
    expect(choices.map(t => t.key)).toEqual(['hvac', 'plumbing']);
  });

  it('honours an override only when it names one of the company trades and there is more than one', () => {
    expect(resolveJobPackTemplate(['hvac', 'plumbing'], 'plumbing').template.key).toBe('plumbing');
    expect(resolveJobPackTemplate(['hvac', 'plumbing'], 'carpentry').template.key).toBe('hvac');
    expect(resolveJobPackTemplate(['hvac'], 'plumbing').template.key).toBe('hvac');
  });

  it('falls back to general when electrical is missing from the registry', () => {
    const noElectrical = JOB_PACK_TEMPLATES.filter(t => t.key !== 'electrical');
    expect(resolveJobPackTemplate([], null, noElectrical).template.key).toBe('general');
  });
});

describe('templateJobPackRows', () => {
  it('lays electrical out as 17 rows in group order with positions counting across the pack', () => {
    const rows = templateJobPackRows(jobPackTemplate('electrical')!);
    expect(rows).toHaveLength(17);
    expect(rows[0]).toEqual({ position: 0, group_key: 'tools', label: 'Multimeter and tester' });
    expect(rows.map(r => r.position)).toEqual([...Array(17).keys()]);
    expect(rows[16].group_key).toBe('safety');
  });
});

describe('jobPackTray', () => {
  it('shows the electrical template with no choices for an empty job at a company with no trades', () => {
    const tray = jobPackTray([], [], null);
    expect(tray.kind).toBe('template');
    if (tray.kind !== 'template') return;
    expect(tray.template.key).toBe('electrical');
    expect(tray.rows).toHaveLength(17);
    expect(tray.choices).toEqual([]);
  });

  it('shows the saved items once one row exists, whatever the company trades say', () => {
    const saved = [item({ id: 'i-1', position: 0 })];
    expect(jobPackTray(saved, ['hvac', 'plumbing'], 'plumbing')).toEqual({ kind: 'saved', items: saved });
    expect(jobPackTray(undefined, [], null).kind).toBe('template');
  });
});

describe('decideJobPackStart', () => {
  it('writes every plumbing item in group order with positions counting across the whole pack', () => {
    const decision = decideJobPackStart({ ...signedIn, packKey: 'plumbing', existing: [] });
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.rows).toHaveLength(17);
    expect(decision.rows.map(r => r.position)).toEqual([...Array(17).keys()]);
    expect(decision.rows.map(r => r.group_key)).toEqual([
      'tools', 'tools', 'tools', 'tools', 'tools',
      'materials', 'materials', 'materials', 'materials',
      'photos', 'photos', 'photos', 'photos',
      'safety', 'safety', 'safety', 'safety',
    ]);
    expect(decision.rows[0]).toEqual({
      company_id: 'co-1',
      job_id: 'job-1',
      pack_key: 'plumbing',
      group_key: 'tools',
      label: 'Pipe wrench set',
      position: 0,
      ticked_at: null,
      ticked_by: null,
      ticked_by_name: null,
      created_by: 'p-sam',
    });
    expect(decision.rows[16].label).toBe('Confined space check if working in a pit');
    expect(decision.rows[16].group_key).toBe('safety');
  });

  it('refuses a second pack on a job that already has one', () => {
    expect(decideJobPackStart({ ...signedIn, packKey: 'plumbing', existing: [item({ id: 'i-1', position: 0 })] })).toEqual({
      action: 'miss',
      reason: 'already_started',
      message: 'This job already has a pack.',
    });
  });

  it('refuses a pack key that is not seeded', () => {
    expect(decideJobPackStart({ ...signedIn, packKey: 'roofing', existing: [] })).toEqual({
      action: 'miss',
      reason: 'unknown_pack',
      message: 'That pack is not on the list.',
    });
  });

  it('writes the whole pack with the first tick already on the tapped row', () => {
    const patch = { ticked_at: '2026-09-11T07:30:00.000Z', ticked_by: 'p-sam', ticked_by_name: 'Sam Cole' };
    const decision = decideJobPackStart({ ...signedIn, packKey: 'electrical', existing: [], tick: { position: 2, patch } });
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.rows).toHaveLength(17);
    expect(decision.rows[2]).toEqual({
      company_id: 'co-1',
      job_id: 'job-1',
      pack_key: 'electrical',
      group_key: 'tools',
      label: 'Cable stripper and crimper',
      position: 2,
      created_by: 'p-sam',
      ...patch,
    });
    const rest = decision.rows.filter(r => r.position !== 2);
    expect(rest).toHaveLength(16);
    expect(rest.every(r => r.ticked_at === null && r.ticked_by === null && r.ticked_by_name === null)).toBe(true);
  });

  it('refuses a first tick on a position the template does not have', () => {
    const patch = { ticked_at: '2026-09-11T07:30:00.000Z', ticked_by: 'p-sam', ticked_by_name: 'Sam Cole' };
    expect(decideJobPackStart({ ...signedIn, packKey: 'electrical', existing: [], tick: { position: 99, patch } })).toEqual({
      action: 'miss',
      reason: 'unknown_item',
      message: 'That item is not on the pack.',
    });
  });

  it('writes the whole pack plus the added item when the first action is an add', () => {
    const decision = decideJobPackStart({ ...signedIn, packKey: 'electrical', existing: [], add: { groupKey: 'materials', label: ' Spare washers ' } });
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.rows).toHaveLength(18);
    expect(decision.rows[17]).toEqual({
      company_id: 'co-1',
      job_id: 'job-1',
      pack_key: 'electrical',
      group_key: 'materials',
      label: 'Spare washers',
      position: 17,
      ticked_at: null,
      ticked_by: null,
      ticked_by_name: null,
      created_by: 'p-sam',
    });
    expect(decideJobPackStart({ ...signedIn, packKey: 'electrical', existing: [], add: { groupKey: 'materials', label: '   ' } })).toEqual({
      action: 'miss',
      reason: 'empty',
      message: 'Write the item first.',
    });
  });

  it('refuses when there is no job or no signed-in profile', () => {
    expect(decideJobPackStart({ ...signedIn, jobId: ' ', packKey: 'general', existing: [] })).toEqual({
      action: 'miss',
      reason: 'no_job',
      message: JOB_PACK_NO_JOB,
    });
    expect(decideJobPackStart({ ...signedIn, userId: null, packKey: 'general', existing: [] })).toEqual({
      action: 'miss',
      reason: 'not_signed_in',
      message: JOB_PACK_NOT_SIGNED_IN,
    });
    expect(JOB_PACK_NO_JOB).toBe('This job is missing.');
    expect(JOB_PACK_NOT_SIGNED_IN).toBe('Not signed in');
  });
});

describe('decideJobPackTick', () => {
  const now = new Date('2026-09-11T07:30:00.000Z');

  it('ticks an unticked item with the exact instant and the profile name', () => {
    expect(decideJobPackTick({ item: item({ id: 'i-1', position: 0 }), userId: 'p-sam', userName: '  Sam Cole ', now })).toEqual({
      ticked_at: '2026-09-11T07:30:00.000Z',
      ticked_by: 'p-sam',
      ticked_by_name: 'Sam Cole',
    });
  });

  it('stamps a blank profile name as Crew', () => {
    expect(decideJobPackTick({ item: item({ id: 'i-1', position: 0 }), userId: 'p-sam', userName: '   ', now }).ticked_by_name).toBe('Crew');
    expect(decideJobPackTick({ item: item({ id: 'i-1', position: 0 }), userId: 'p-sam', userName: undefined, now }).ticked_by_name).toBe('Crew');
  });

  it('builds the same patch for a first tick on a template row', () => {
    expect(jobPackTickPatch('p-sam', ' Sam Cole ', now)).toEqual({
      ticked_at: '2026-09-11T07:30:00.000Z',
      ticked_by: 'p-sam',
      ticked_by_name: 'Sam Cole',
    });
    expect(jobPackTickPatch(undefined, '', now)).toEqual({ ticked_at: '2026-09-11T07:30:00.000Z', ticked_by: null, ticked_by_name: 'Crew' });
  });

  it('unticks a ticked item back to three nulls', () => {
    const ticked = item({ id: 'i-1', position: 0, ticked_at: '2026-09-11T07:00:00.000Z', ticked_by: 'p-alex', ticked_by_name: 'Alex Reed' });
    expect(decideJobPackTick({ item: ticked, userId: 'p-sam', userName: 'Sam Cole', now })).toEqual({
      ticked_at: null,
      ticked_by: null,
      ticked_by_name: null,
    });
  });
});

describe('applyJobPackTick', () => {
  it('patches only the named item and leaves the rest untouched', () => {
    const items = [item({ id: 'i-1', position: 0 }), item({ id: 'i-2', position: 1 }), item({ id: 'i-3', position: 2 })];
    const patch = { ticked_at: '2026-09-11T07:30:00.000Z', ticked_by: 'p-sam', ticked_by_name: 'Sam Cole' };
    const next = applyJobPackTick(items, 'i-2', patch);
    expect(next.map(i => i.ticked_at)).toEqual([null, '2026-09-11T07:30:00.000Z', null]);
    expect(next[1]).toEqual({ ...items[1], ...patch });
    expect(next[0]).toEqual(items[0]);
    expect(next[2]).toBe(items[2]);
    expect(items[1].ticked_at).toBe(null);
  });
});

describe('decideJobPackAddItem', () => {
  const existing = [
    item({ id: 'i-1', position: 0, pack_key: 'carpentry' }),
    item({ id: 'i-2', position: 7, pack_key: 'carpentry' }),
    item({ id: 'i-3', position: 3, pack_key: 'carpentry' }),
  ];

  it('appends after the highest position and inherits the pack key', () => {
    expect(decideJobPackAddItem({ ...signedIn, groupKey: 'materials', label: '  Spare washers  ', existing })).toEqual({
      action: 'write',
      row: {
        company_id: 'co-1',
        job_id: 'job-1',
        pack_key: 'carpentry',
        group_key: 'materials',
        label: 'Spare washers',
        position: 8,
        ticked_at: null,
        ticked_by: null,
        ticked_by_name: null,
        created_by: 'p-sam',
      },
    });
  });

  it('caps the label at 80 characters', () => {
    const decision = decideJobPackAddItem({ ...signedIn, groupKey: 'tools', label: 'x'.repeat(100), existing });
    expect(decision.action).toBe('write');
    if (decision.action === 'write') expect(decision.row.label).toBe('x'.repeat(80));
  });

  it('refuses a blank label and a job with no pack yet', () => {
    expect(decideJobPackAddItem({ ...signedIn, groupKey: 'tools', label: '   ', existing })).toEqual({
      action: 'miss',
      reason: 'empty',
      message: 'Write the item first.',
    });
    expect(decideJobPackAddItem({ ...signedIn, groupKey: 'tools', label: 'Ladder', existing: [] })).toEqual({
      action: 'miss',
      reason: 'no_pack',
      message: 'Pick a pack before adding items.',
    });
  });
});

describe('groupJobPackItems', () => {
  it('orders groups by the registry, not alphabetically, and omits empty groups', () => {
    const items = [
      item({ id: 'i-s', position: 5, group_key: 'safety' }),
      item({ id: 'i-m', position: 2, group_key: 'materials', ticked_at: '2026-09-11T07:00:00.000Z' }),
      item({ id: 'i-p', position: 4, group_key: 'photos' }),
      item({ id: 'i-t2', position: 1, group_key: 'tools' }),
      item({ id: 'i-t1', position: 0, group_key: 'tools', ticked_at: '2026-09-11T07:00:00.000Z' }),
    ];
    const grouped = groupJobPackItems(items);
    expect(grouped.map(g => g.group.key)).toEqual(['tools', 'materials', 'photos', 'safety']);
    expect(grouped.map(g => g.group.label)).toEqual(['Tools', 'Materials', 'Required photos', 'Safety']);
    expect(grouped[0].items.map(i => i.id)).toEqual(['i-t1', 'i-t2']);
    expect(grouped.map(g => g.ticked)).toEqual([1, 1, 0, 0]);
    expect(groupJobPackItems([item({ id: 'i-p', position: 0, group_key: 'photos' })]).map(g => g.group.key)).toEqual(['photos']);
    expect(groupJobPackItems([])).toEqual([]);
  });

  it('breaks a same-position tie on id', () => {
    const grouped = groupJobPackItems([item({ id: 'i-b', position: 0 }), item({ id: 'i-a', position: 0 })]);
    expect(grouped[0].items.map(i => i.id)).toEqual(['i-a', 'i-b']);
  });
});

describe('jobPackProgress', () => {
  it('counts ticked over total and is done only at all ticked', () => {
    const five = [0, 1, 2, 3, 4].map(n => item({ id: `i-${n}`, position: n, ticked_at: n < 2 ? '2026-09-11T07:00:00.000Z' : null }));
    expect(jobPackProgress(five)).toEqual({ ticked: 2, total: 5, done: false });
    expect(jobPackProgress(five.map(i => ({ ...i, ticked_at: '2026-09-11T07:00:00.000Z' })))).toEqual({ ticked: 5, total: 5, done: true });
    expect(jobPackProgress([])).toEqual({ ticked: 0, total: 0, done: false });
  });
});

describe('jobPackItemsQuery', () => {
  it('scopes the pack to this company and this job', () => {
    expect(jobPackItemsQuery({ companyId: ' co-1 ', jobId: 'job-1' })).toEqual({ eq: { company_id: 'co-1', job_id: 'job-1' } });
    expect(jobPackItemsQuery({ companyId: '', jobId: 'job-1' })).toBe(null);
    expect(jobPackItemsQuery({ companyId: 'co-1', jobId: '  ' })).toBe(null);
    expect(JOB_PACK_TABLE).toBe('job_pack_items');
  });
});

describe('job pack lives on the existing job sheet', () => {
  it('ticks from JobDetailPage /jobs/:id between the bill and JHA, with no pack route', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const app = src('src/App.tsx');
    expect(page).toContain('id="job-pack"');
    expect(page).toContain('data-job-pack-start');
    expect(page).toContain('data-job-pack-item');
    expect(page).toContain('startJobPack');
    expect(page).toContain('tickJobPackItem');
    expect(page).toContain('addJobPackItem');
    expect(page.indexOf('id="job-pack"')).toBeGreaterThan(page.indexOf('id="job-bill"'));
    expect(page.indexOf('id="job-pack"')).toBeLessThan(page.indexOf('id="job-swms"'));
    expect(app).not.toContain('path="/job-pack"');
    expect(app).not.toContain('path="/packs"');
    expect(page).not.toContain('JOB_PACK_TEMPLATES.map');
    expect(page).toContain('data-job-pack-template');
    expect(page).not.toMatch(/Relovi|Littleloop|ute photos/i);
  });
});

describe('company trades decide the pack', () => {
  it('stores trades on the company, sets them at signup and in Settings, and the harness walks both shapes', () => {
    const mig = src('supabase/migrations/20260911100000_080_company_trades.sql');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    const signup = src('src/pages/SignupPage.tsx');
    const edge = src('supabase/functions/signup-user/index.ts');
    const prove = src('scripts/prove-job-pack.mjs');
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS trades text[] NOT NULL DEFAULT '{}'");
    expect(mig).toContain("CHECK (trades <@ ARRAY['plumbing', 'electrical', 'hvac', 'carpentry', 'general']::text[])");
    expect(settings).toContain('data-company-trade');
    expect(settings).toContain('parseCompanyTrades');
    expect(signup).toContain('data-signup-trade');
    expect(signup).toContain('trades,');
    expect(edge).toContain('trades,');
    expect(edge).not.toMatch(/electrician|switchboard|electrical-only/i);
    expect(prove).toContain('firstOpenAutoLoadsElectricalWithoutAPicker');
    expect(prove).toContain('trades=plumbing,electrical');
    for (const text of [mig, settings, signup, edge, prove]) expect(text).not.toMatch(/Relovi|Littleloop/);
  });
});

describe('job_pack_items schema', () => {
  it('locks one row per item with the four group keys and company-scoped RLS', () => {
    const mig = src('supabase/migrations/20260911090000_079_job_pack_items.sql');
    const db = src('src/types/database.ts');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS public.job_pack_items');
    expect(mig).toContain('ENABLE ROW LEVEL SECURITY');
    expect(mig).toContain("CHECK (group_key IN ('tools', 'materials', 'photos', 'safety'))");
    expect(mig).toContain('job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE');
    expect(mig).toContain('FOR SELECT');
    expect(mig).toContain('FOR INSERT');
    expect(mig).toContain('FOR UPDATE');
    expect(mig).not.toContain('FOR DELETE');
    expect(mig).toContain('(ticked_by IS NULL OR ticked_by = auth.uid())');
    expect(mig).toContain('GRANT SELECT, INSERT, UPDATE ON public.job_pack_items TO authenticated');
    expect(mig).not.toMatch(/Relovi|Littleloop/);
    expect(db).toContain('job_pack_items: AnyTable');
  });
});
