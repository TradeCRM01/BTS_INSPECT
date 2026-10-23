import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function remindersCss(): string {
  const css = src('src/index.css');
  const start = css.indexOf('/* Reminders. Same paper kit as the signed-in home');
  const end = css.indexOf('/* Inspections list document only.', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('reminders LOOK — same paper as the signed-in home', () => {
  it('puts the list, the edit sheet, and the Today strip on the dashboard paper kit', () => {
    const list = src('src/pages/RemindersPage.tsx');
    const edit = src('src/pages/ReminderEditPage.tsx');
    const home = src('src/pages/DashboardPage.tsx');

    for (const page of [list, edit]) {
      expect(page).toContain('className="ops-page dashboard-home reminders-page"');
      expect(page).toContain('dashboard-home-sheet');
      expect(page).toContain('dashboard-home-sheet-bar');
      expect(page).toContain('dashboard-home-mark">Reminders');
      expect(page).toContain('dashboard-home-sheet-body');
      expect(page).toContain('dashboard-home-primary');
      expect(page).not.toMatch(/\bute\b/i);
      expect(page).not.toContain('getAudit');
    }

    expect(list).toContain('data-reminders-page');
    expect(list).toContain('ops-page-title dashboard-home-hero">Reminders');
    expect(list).toContain('id="reminder-capture"');
    expect(list).toContain('className="btn-primary dashboard-home-primary reminders-capture-add"');
    expect(list).toContain('data-reminders-tab={tab.key}');
    expect(list).toContain('data-reminders-scope={chip.key}');
    expect(list).toContain('<ReminderRow');

    expect(edit).toContain('data-reminder-edit');
    expect(edit).toContain(`ops-page-title dashboard-home-hero">{isOwner ? 'Edit reminder' : 'Reminder'}`);
    expect(edit).toContain('data-reminder-access={access}');
    expect(edit).toContain('disabled={!isOwner}');
    expect(edit).toContain('className="reminders-back">‹ Reminders');
    for (const id of ['reminder-title', 'reminder-job', 'reminder-details', 'reminder-date', 'reminder-time']) {
      expect(edit).toContain(`id="${id}"`);
    }
    expect(edit).toContain('name="reminder-visibility"');
    expect(edit).toContain('data-reminder-tag={member.id}');
    expect(edit).toContain('className="btn-primary dashboard-home-primary reminder-save"');
    expect(edit).toContain("className={`reminder-done ${isOwner ? 'reminders-secondary' : 'btn-primary dashboard-home-primary'}`}");
    expect(edit).toContain('className="reminder-delete reminders-link is-danger"');
    expect(edit).toContain('className="reminder-visibility-note"');

    expect(home).toContain('data-dashboard-reminders');
    expect(home).toContain('className="today-sec today-reminders dashboard-home-strip"');
    expect(home).toContain('id="today-reminders-h">Reminders');
    expect(home).toContain('to="/reminders" className="today-quiet dashboard-home-all"');
    expect(home).toContain('id="dashboard-reminder-capture"');
    expect(home).toContain('todayReminders(');
    expect(home).toContain('deriveNudges(');
    const board = src('src/pages/TodayBoardView.tsx');
    expect(board).toContain('className="today-need-row" data-nudge-kind={nudge.kind}');
    expect(board).toContain('to="/schedule" className="today-quiet"');
    expect(board).not.toContain('dashboard-nudge');
    expect(board).not.toContain('dashboard-home-');
    expect(home.indexOf('TodayBoardView')).toBeLessThan(home.indexOf('data-dashboard-reminders'));
  });

  it('renders one ReminderRow for both surfaces with tick, body link, chips, visibility, and postpone', () => {
    const row = src('src/components/reminders/ReminderRow.tsx');
    expect(row).toContain('className="reminders-tick"');
    expect(row).toContain("aria-label={canTick ? 'Mark as done' : 'Only the owner or a tagged teammate can mark this done'}");
    expect(row).toContain('disabled={!canTick}');
    expect(row).toContain('className="reminders-body"');
    expect(row).toContain('className="reminders-title"');
    expect(row).toContain('className="reminders-meta"');
    expect(row).toContain('className="reminders-tagged"');
    expect(row).toContain('className="reminders-vis"');
    expect(row).toContain('className="reminders-postpone"');
    expect(row).toContain('className="reminders-clock" aria-label="Postpone"');
    expect(row).toContain('data-postpone={choice.key}');
    expect(row).toContain('data-reminder-id={reminder.id}');
    expect(row).toContain('data-visibility={reminder.visibility}');
  });

  it('keeps the reminders CSS on the four locked values, 44px fields, no orange or green', () => {
    const css = remindersCss();

    expect(css).toContain('.reminders-capture-input,\n  .reminders-field {');
    const field = rule(css, '.reminders-capture-input,\n  .reminders-field');
    expect(field).toContain('min-height: 44px');
    expect(field).toContain('background: var(--dashboard-home-sheet)');
    expect(field).toContain('border: 1px solid var(--dashboard-home-line)');
    expect(field).toContain('border-radius: 12px');
    expect(field).toContain('padding: 10px 12px');
    expect(field).toContain('font-size: 16px');
    expect(field).toContain('color: var(--dashboard-home-ink)');
    expect(field).toContain("font-family: var(--g-font-ui)");

    expect(rule(css, '.reminders-capture-input:focus,\n  .reminders-field:focus')).toContain('color-mix(in srgb, var(--g-accent) 25%, transparent)');
    expect(rule(css, '.reminders-secondary')).toContain('border: 1px solid var(--dashboard-home-ink)');
    expect(rule(css, '.reminders-secondary')).toContain('min-height: 44px');
    expect(rule(css, '.reminders-tick[aria-pressed="true"]')).toContain('background: var(--g-inverse)');
    expect(rule(css, '.dashboard-nudge')).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(rule(css, '.dashboard-nudge')).toContain('min-height: 44px');
    expect(rule(css, '.dashboard-home-all')).toContain('min-height: 44px');
    expect(rule(css, '.reminders-scopes button,\n  .reminders-tag-chips button')).toContain('height: 32px');
    expect(css).toContain("font-family: var(--g-font-title)");
    expect(css).toContain('@media (max-width: 640px)');

    const hexes = [...new Set(css.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? [])].map(h => h.toUpperCase());
    expect(hexes.sort()).toEqual(['#FFF']);
    expect(css).not.toMatch(/#F97316|#EA580C|#16A34A|#15803D|#1B7F3A|#22C55E|orange|green/i);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/\bute\b/i);
  });
});
