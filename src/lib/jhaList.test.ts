import { describe, expect, it } from 'vitest';
import {
  decorateJhaForList,
  decorateJhaList,
  filterJhaListFloor,
  formatJhaListDate,
  groupJhaListFloor,
  jhaDocumentHref,
  jhaListCrewProgress,
  jhaListEmptyMessage,
  jhaListEmptyTitle,
  jhaListGroupTitle,
  jhaListJobNumberLabel,
  jhaListSearchHaystack,
  jhaMatchesListFilter,
  jhaMatchesSearch,
  normalizeJhaSearch,
  padJhaListJobNumber,
  parseJhaListFilter,
  sortJhaListFloor,
  type JhaListRow,
} from './jhaList';

function row(over: Partial<JhaListRow> & { id: string }): JhaListRow {
  return {
    status: 'draft',
    created_at: '2026-08-20T00:00:00.000Z',
    completed_at: null,
    report_number: null,
    meta: {},
    ...over,
  };
}

const unsigned = { id: 'w1', name: 'Sam Spark', role: 'Electrician', date: '2026-08-20' };
const signed = { ...unsigned, signature: 'data:image/png;base64,xx' };

describe('jhaDocumentHref', () => {
  it('opens the existing JHA fill route, not a new safety product', () => {
    expect(jhaDocumentHref('doc-42')).toBe('/jha/new?docId=doc-42');
    expect(jhaDocumentHref('doc-42')).not.toContain('/swms');
    expect(jhaDocumentHref('doc-42')).not.toContain('/jha/take5');
  });
});

describe('parseJhaListFilter', () => {
  it('defaults to open so the contractor sees work that still needs them', () => {
    expect(parseJhaListFilter(null)).toBe('open');
    expect(parseJhaListFilter('')).toBe('open');
    expect(parseJhaListFilter('month')).toBe('open');
    expect(parseJhaListFilter('open')).toBe('open');
    expect(parseJhaListFilter('all')).toBe('all');
    expect(parseJhaListFilter('draft')).toBe('draft');
    expect(parseJhaListFilter('completed')).toBe('completed');
    expect(parseJhaListFilter('published')).toBe('published');
  });
});

describe('jhaMatchesListFilter', () => {
  it('treats draft and ready as open, and keeps published off that floor', () => {
    expect(jhaMatchesListFilter('draft', 'open')).toBe(true);
    expect(jhaMatchesListFilter('completed', 'open')).toBe(true);
    expect(jhaMatchesListFilter('published', 'open')).toBe(false);
    expect(jhaMatchesListFilter('published', 'published')).toBe(true);
    expect(jhaMatchesListFilter('draft', 'all')).toBe(true);
    expect(jhaMatchesListFilter('published', 'all')).toBe(true);
    expect(jhaMatchesListFilter('completed', 'draft')).toBe(false);
    expect(jhaMatchesListFilter('completed', 'completed')).toBe(true);
  });
});

describe('search', () => {
  const board = row({
    id: 'jha-1',
    report_number: 'JHA-0042',
    job_number: 42,
    job_title: 'Switchboard upgrade',
    job_address: '12 Smith St, Geelong',
    client_name: 'Acme Build',
    amendment_reason: 'Scope changed',
    template_snapshot: { name: 'Electrical JHA' },
    meta: {
      taskName: 'Isolate MSB',
      siteName: 'Plant A',
      documentTitle: 'MSB isolation',
      supervisor: 'Pat Lead',
      permitRefs: 'PTW-88',
      plantArea: 'Substation',
      shift: 'Day',
      siteContact: 'Site hut',
      clientName: 'Acme',
      crewSignOns: JSON.stringify([unsigned]),
    },
  });

  it('finds a JHA by job number, site, permit, supervisor, or crew', () => {
    expect(normalizeJhaSearch('#0042')).toBe('0042');
    expect(jhaMatchesSearch(board, '0042')).toBe(true);
    expect(jhaMatchesSearch(board, '#42')).toBe(true);
    expect(jhaMatchesSearch(board, 'Smith St')).toBe(true);
    expect(jhaMatchesSearch(board, 'PTW-88')).toBe(true);
    expect(jhaMatchesSearch(board, 'Pat Lead')).toBe(true);
    expect(jhaMatchesSearch(board, 'Sam Spark')).toBe(true);
    expect(jhaMatchesSearch(board, 'Switchboard')).toBe(true);
    expect(jhaMatchesSearch(board, 'no such site')).toBe(false);
    expect(jhaListSearchHaystack(board)).toContain('#0042');
  });
});

describe('crew progress and card decorate', () => {
  it('labels unsigned crew as a count, and all-signed as signed', () => {
    expect(jhaListCrewProgress([]).label).toBeNull();
    expect(jhaListCrewProgress([unsigned]).label).toBe('0 of 1 signed');
    expect(jhaListCrewProgress([signed, unsigned]).label).toBe('1 of 2 signed');
    expect(jhaListCrewProgress([signed]).label).toBe('1 signed');
  });

  it('pads the existing job number the same way as the rest of the app', () => {
    expect(padJhaListJobNumber(42)).toBe('0042');
    expect(jhaListJobNumberLabel(42)).toBe('#0042');
    expect(jhaListJobNumberLabel(null)).toBeNull();
  });

  it('opens the existing doc and surfaces site/permit/crew from stored fields', () => {
    const item = decorateJhaForList(row({
      id: 'doc-9',
      status: 'draft',
      job_id: 'job-1',
      job_title: 'Meter',
      job_address: '9 Volt Rd',
      job_number: 9,
      job_assigned_team: ['emp-a'],
      meta: {
        documentTitle: 'Meter swap',
        permitRefs: 'ISO-12',
        supervisor: 'Pat',
        plantArea: 'MSB room',
        shift: 'Night',
        crewSignOns: JSON.stringify([unsigned]),
      },
    }), [{ id: 'emp-a', name: 'Alex Crew', role: 'tech' }]);

    expect(item.href).toBe('/jha/new?docId=doc-9');
    expect(item.bucket).toBe('open');
    expect(item.title).toBe('Meter swap');
    expect(item.jobNumberLabel).toBe('#0009');
    expect(item.permitLabel).toBe('Permit ISO-12');
    expect(item.supervisorLabel).toBe('Pat');
    expect(item.sitePack).toBe('MSB room · Night');
    expect(item.livingSite).toBe('9 Volt Rd');
    expect(item.next.label).toBe('Get signatures');
    expect(item.crewProgress).toMatch(/signed/);
    expect(item.crew.some(person => person.name === 'Alex Crew' || person.name === 'Sam Spark')).toBe(true);
  });
});

describe('sort and group', () => {
  it('puts missing site before crew/sign, then the scheduled job day', () => {
    const items = decorateJhaList([
      row({
        id: 'later-sign',
        status: 'draft',
        job_scheduled_date: '2026-08-28',
        created_at: '2026-08-21T00:00:00.000Z',
        meta: { siteName: 'A', crewSignOns: JSON.stringify([unsigned]) },
      }),
      row({
        id: 'no-site',
        status: 'draft',
        created_at: '2026-08-10T00:00:00.000Z',
        meta: {},
      }),
      row({
        id: 'today-crew',
        status: 'completed',
        job_scheduled_date: '2026-08-27',
        created_at: '2026-08-22T00:00:00.000Z',
        meta: { siteName: 'B' },
      }),
      row({
        id: 'published',
        status: 'published',
        completed_at: '2026-08-26T00:00:00.000Z',
        created_at: '2026-08-01T00:00:00.000Z',
        meta: { siteName: 'C', crewSignOns: JSON.stringify([signed]) },
      }),
    ]);

    const sorted = sortJhaListFloor(items);
    expect(sorted.map(item => item.row.id)).toEqual([
      'no-site',
      'today-crew',
      'later-sign',
      'published',
    ]);

    const grouped = groupJhaListFloor(sorted);
    expect(grouped.open.map(item => item.row.id)).toEqual(['no-site', 'today-crew', 'later-sign']);
    expect(grouped.published.map(item => item.row.id)).toEqual(['published']);
  });

  it('keeps published off the open filter and finds by search after decorate', () => {
    const items = decorateJhaList([
      row({ id: 'open-a', status: 'draft', job_title: 'Switchboard', meta: { siteName: 'Depot' } }),
      row({ id: 'done-a', status: 'published', job_title: 'Switchboard', meta: { siteName: 'Depot' } }),
    ]);
    const open = filterJhaListFloor(items, { filter: 'open', search: '' });
    expect(open.map(item => item.row.id)).toEqual(['open-a']);
    const found = filterJhaListFloor(items, { filter: 'all', search: 'Switchboard' });
    expect(found.map(item => item.row.id)).toEqual(['open-a', 'done-a']);
  });
});

describe('copy', () => {
  it('does not pretend there are no JHAs when only the open floor is empty', () => {
    expect(jhaListEmptyTitle({ filter: 'open', noneAtAll: true })).toBe('No JHA documents yet');
    expect(jhaListEmptyTitle({ filter: 'open', noneAtAll: false })).toBe('Nothing open');
    expect(jhaListEmptyMessage({ filter: 'open', noneAtAll: false })).toContain('Published JHAs sit under All');
    expect(jhaListEmptyMessage({ filter: 'open', noneAtAll: true })).toContain('Start JHA');
    expect(jhaListGroupTitle('open')).toBe('Open');
    expect(jhaListGroupTitle('all', 'published')).toBe('Published');
    expect(jhaListGroupTitle('completed')).toBe('Ready');
    expect(formatJhaListDate('2026-08-27T10:00:00.000Z')).toBe('27 Aug 2026');
  });
});
