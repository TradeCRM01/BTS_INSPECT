/**
 * @vitest-environment node
 *
 * Layout-vs-mockup proof is the painted Chromium kill on a VITE_LOOK_PROOF
 * dist, not this file. This pin dies if that it() is removed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1b Today board layout', () => {
  it('keeps the painted 390/1280 section-rect kill on the look dist', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/layout/p1Dashboard.chromium.kill.tsx'), 'utf8');
    expect(src).toContain("P1b-layout: painted section rects match the light mockup at 390 and 1280");
    expect(src).toContain('P1b-layout mutant: swapping jobs and needs in TodayBoardView goes red');
    expect(src).toContain('P1b-board-above-grid: board bottom sits before the widget grid top at 375/390/768/1024/1280');
    expect(src).toContain('P1b-grid-clip: no clipped text on any grid card in view and edit, no id filter');
    expect(src).toContain('P1b-edit-overlap: edit handles miss card text at 375/390/768/1024/1280');
    expect(src).toContain('P1b-edit-chrome: view+edit controls hit-test and stay on their card at 768/1024/1280');
    expect(src).toContain('P1b-edit-chrome mutant: absolute bars outside the card go red');
    expect(src).toContain('P1b-widget-1280: view and edit widget ids and widths match main 0898c3b9');
    expect(src).toContain('C7 painted: overdue is plain warn text');
    expect(src).toContain('P1b-table-rects: 1280 row height, column x, and Needs you chevron share a line');
    expect(src).toContain('P1b-phone-meta: 390 meta sits under the title, not in the time column');
    expect(src).toContain('P1b-sep-baseline: · centre y is within 2px of the text centre at 390 and 1280');
    expect(src).toContain('P1b-place-cell: 1280 Place is row-tall, row-centred, and has no mid-row hairline');
    expect(src).toContain('P1b-phone-place: 390 meta shows place, not the client, and no · starts or ends a line');
    expect(src).toContain('P1b-needs-count: 390 hides the Needs you count and keeps the list uncapped');
    expect(src).toContain('P1b-query-need-crew: non-look fixture paints the dated crewless count');
    expect(src).toContain('P1b-query-cash-out: non-look fixture Out excludes wages and super');
    expect(src).toContain('P1b-query-outstanding: non-look fixture outstanding is company-scoped');
    expect(src).not.toContain("expect(ids).toEqual(['s1', 's2', 's3', 's4', 's6', 's10', 's11', 's13', 's14', 's15', 's12'])");
  });
});
