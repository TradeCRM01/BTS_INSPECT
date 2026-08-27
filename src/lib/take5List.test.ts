import { describe, expect, it } from 'vitest';
import {
  TAKE5_LIST_DEFAULT_FILTER,
  TAKE5_LIST_FILTERS,
  compareTake5ListItems,
  take5ListActionRank,
  take5ListCardId,
  take5ListCardLine,
  take5ListEmptyKind,
  take5ListGoStop,
  take5ListGoStopClass,
  take5ListGroups,
  take5ListHazardLine,
  take5ListHeadMeta,
  take5ListJobRef,
  take5ListMatchesFilter,
  take5ListMatchesQuery,
  take5ListNormalizeQuery,
  take5ListOpenHref,
  take5ListVisibleItems,
  type Take5ListItem,
} from './take5List';

function item(partial: Partial<Take5ListItem> & { id: string }): Take5ListItem {
  return {
    status: 'draft',
    go_no_go: 'go',
    created_at: '2026-08-27T08:00:00.000Z',
    jha_document_id: 'jha-1',
    stop_think: 'Isolate',
    identify_hazards: 'Live parts',
    control_actions: 'Lock out',
    ...partial,
  };
}

describe('take5 list floor filter', () => {
  it('defaults to Open so a sparkie sees unfinished Take 5s', () => {
    expect(TAKE5_LIST_DEFAULT_FILTER).toBe('open');
    expect(TAKE5_LIST_FILTERS.map(f => f.value)).toEqual(['open', 'done', 'all']);
    expect(TAKE5_LIST_FILTERS[0].label).toBe('Open');
  });

  it('treats draft as open and completed as done — existing statuses only', () => {
    expect(take5ListMatchesFilter('draft', 'open')).toBe(true);
    expect(take5ListMatchesFilter('completed', 'open')).toBe(false);
    expect(take5ListMatchesFilter('completed', 'done')).toBe(true);
    expect(take5ListMatchesFilter('draft', 'done')).toBe(false);
    expect(take5ListMatchesFilter('draft', 'all')).toBe(true);
    expect(take5ListMatchesFilter('completed', 'all')).toBe(true);
    expect(take5ListMatchesFilter('unknown', 'open')).toBe(true);
  });
});

describe('take5 list open href', () => {
  it('opens the existing fill with parent JHA and Take 5 id', () => {
    expect(take5ListOpenHref({ jha_document_id: 'jha-1', id: 't5-9' })).toBe(
      '/jha/take5?jhaId=jha-1&id=t5-9',
    );
  });

  it('does not invent a new Take 5 or SWMS route', () => {
    const href = take5ListOpenHref({ jha_document_id: 'jha-1', id: 't5-9' });
    expect(href.startsWith('/jha/take5?')).toBe(true);
    expect(href).not.toContain('/swms');
    expect(href).not.toContain('/take5/new');
    expect(href).not.toContain('/safety');
  });
});

describe('take5 list search', () => {
  const board = item({
    id: 't5-board',
    job_number: 42,
    job_title: 'Switchboard upgrade',
    job_address: '12 Workshop Rd, Geelong VIC',
    livingSite: '12 Workshop Rd, Geelong VIC',
    livingCrew: 'Sam Spark, Alex Leading Hand',
    parent_report: 'JHA-0042',
    parent_task: 'Isolate main board',
    signed_name: 'Sam Spark',
    identify_hazards: 'Exposed busbar',
    go_no_go: 'stop',
  });

  it('strips a leading hash so #0042 and 42 match the job', () => {
    expect(take5ListNormalizeQuery('#0042')).toBe('0042');
    expect(take5ListMatchesQuery(board, '#0042')).toBe(true);
    expect(take5ListMatchesQuery(board, '0042')).toBe(true);
    expect(take5ListMatchesQuery(board, '42')).toBe(true);
    expect(take5ListMatchesQuery(board, '#42')).toBe(true);
    expect(take5ListJobRef(42)).toBe('#0042');
    expect(take5ListJobRef(null)).toBeNull();
  });

  it('matches site, job title, JHA report, crew, signer, and STOP', () => {
    expect(take5ListMatchesQuery(board, 'geelong')).toBe(true);
    expect(take5ListMatchesQuery(board, 'switch')).toBe(true);
    expect(take5ListMatchesQuery(board, 'jha-0042')).toBe(true);
    expect(take5ListMatchesQuery(board, 'alex')).toBe(true);
    expect(take5ListMatchesQuery(board, 'sam spark')).toBe(true);
    expect(take5ListMatchesQuery(board, 'stop')).toBe(true);
    expect(take5ListMatchesQuery(board, 'busbar')).toBe(true);
    expect(take5ListMatchesQuery(board, 'zzz')).toBe(false);
  });

  it('matches a Take 5 location even when the living site is empty', () => {
    const row = item({
      id: 't5-loc',
      meta: { location: 'Switchroom B' },
      livingSite: '',
    });
    expect(take5ListMatchesQuery(row, 'switchroom')).toBe(true);
  });
});

describe('take5 list sort and visible rows', () => {
  const stopUnsigned = item({
    id: 't5-stop',
    go_no_go: 'stop',
    livingSite: 'Plant A',
    signature: null,
    created_at: '2026-08-26T10:00:00.000Z',
  });
  const goMissingSite = item({
    id: 't5-site',
    go_no_go: 'go',
    livingSite: '',
    job_title: '',
    job_address: '',
    parent_site: '',
    stop_think: '',
    identify_hazards: '',
    control_actions: '',
    created_at: '2026-08-27T09:00:00.000Z',
  });
  const goContinue = item({
    id: 't5-cont',
    go_no_go: 'go',
    livingSite: 'Yard B',
    stop_think: '',
    identify_hazards: '',
    control_actions: '',
    created_at: '2026-08-25T10:00:00.000Z',
  });
  const done = item({
    id: 't5-done',
    status: 'completed',
    go_no_go: 'go',
    livingSite: 'Plant A',
    signature: 'data:image/png;base64,xx',
    created_at: '2026-08-24T10:00:00.000Z',
  });

  it('ranks STOP first, then the thinnest open Take 5, then site', () => {
    expect(take5ListActionRank(goMissingSite)).toBe(0);
    expect(take5ListActionRank(goContinue)).toBe(1);
    expect(take5ListActionRank(stopUnsigned)).toBe(2);
    expect(take5ListActionRank(done)).toBe(4);

    const sorted = [done, goContinue, goMissingSite, stopUnsigned].sort(compareTake5ListItems);
    expect(sorted.map(r => r.id)).toEqual(['t5-stop', 't5-site', 't5-cont', 't5-done']);
  });

  it('Open hides completed rows; All keeps them after open', () => {
    const rows = [done, goContinue, stopUnsigned];
    expect(take5ListVisibleItems(rows, { filter: 'open' }).map(r => r.id)).toEqual([
      't5-stop',
      't5-cont',
    ]);
    expect(take5ListVisibleItems(rows, { filter: 'done' }).map(r => r.id)).toEqual(['t5-done']);
    expect(take5ListVisibleItems(rows, { filter: 'all' }).map(r => r.id)).toEqual([
      't5-stop',
      't5-cont',
      't5-done',
    ]);
  });

  it('search + Open only returns matching unfinished Take 5s', () => {
    const visible = take5ListVisibleItems(
      [done, goContinue, stopUnsigned],
      { filter: 'open', query: 'plant' },
    );
    expect(visible.map(r => r.id)).toEqual(['t5-stop']);
  });
});

describe('take5 list groups, empty kinds, and card copy', () => {
  it('splits visible rows into open and done', () => {
    const groups = take5ListGroups([
      item({ id: 'a', status: 'draft' }),
      item({ id: 'b', status: 'completed' }),
    ]);
    expect(groups.open.map(r => r.id)).toEqual(['a']);
    expect(groups.done.map(r => r.id)).toEqual(['b']);
  });

  it('tells none / none-open / none-done / none-match apart', () => {
    expect(take5ListEmptyKind({ total: 0, visible: 0, filter: 'open', query: '' })).toBe('none');
    expect(take5ListEmptyKind({ total: 3, visible: 0, filter: 'open', query: '' })).toBe('none-open');
    expect(take5ListEmptyKind({ total: 3, visible: 0, filter: 'done', query: '' })).toBe('none-done');
    expect(take5ListEmptyKind({ total: 3, visible: 0, filter: 'open', query: '#99' })).toBe('none-match');
    expect(take5ListEmptyKind({ total: 3, visible: 2, filter: 'open', query: '' })).toBeNull();
  });

  it('shows job # on the card, JHA report in the date line, GO/STOP, and hazards', () => {
    const row = item({
      id: 't5-card',
      job_number: 42,
      parent_report: 'JHA-0042',
      parent_task: 'Isolate main board',
      livingCrew: 'Sam Spark',
      go_no_go: 'stop',
      signed_name: 'Sam Spark',
      identify_hazards: 'Exposed busbar',
    });
    expect(take5ListCardId(row)).toBe('#0042');
    expect(take5ListCardId({ job_number: null, parent_report: null })).toBe('Draft');
    expect(take5ListHeadMeta(row, '27 Aug 2026')).toBe('27 Aug 2026 · JHA-0042');
    expect(take5ListCardLine(row)).toBe('Isolate main board · Sam Spark · STOP');
    expect(take5ListCardLine(item({
      id: 't5-signed-only',
      livingCrew: '',
      signed_name: 'Alex Leading Hand',
      parent_task: '',
      job_title: 'Switchboard',
      go_no_go: 'go',
    }))).toBe('Switchboard · Alex Leading Hand · GO');
    expect(take5ListHazardLine(row)).toBe('Exposed busbar');
    expect(take5ListGoStop('stop')).toBe('STOP');
    expect(take5ListGoStop('go')).toBe('GO');
    expect(take5ListGoStopClass('stop')).toBe('ops-status-bad');
    expect(take5ListGoStopClass('go')).toBe('ops-status-ok');
  });

  it('falls hazard copy back to stop & think, then controls', () => {
    expect(take5ListHazardLine(item({
      id: 't5-stop-think',
      identify_hazards: '  ',
      stop_think: 'Prove dead',
      control_actions: 'Lock out',
    }))).toBe('Prove dead');
    expect(take5ListHazardLine(item({
      id: 't5-controls',
      identify_hazards: '',
      stop_think: '',
      control_actions: 'Lock out MSB',
    }))).toBe('Lock out MSB');
  });

  it('keeps the newer Take 5 first when site and action rank match', () => {
    const older = item({
      id: 't5-old',
      livingSite: 'Yard B',
      created_at: '2026-08-20T10:00:00.000Z',
    });
    const newer = item({
      id: 't5-new',
      livingSite: 'Yard B',
      created_at: '2026-08-27T10:00:00.000Z',
    });
    expect(take5ListVisibleItems([older, newer], { filter: 'open' }).map(r => r.id)).toEqual([
      't5-new',
      't5-old',
    ]);
  });
});
