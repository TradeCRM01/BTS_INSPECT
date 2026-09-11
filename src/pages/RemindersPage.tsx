import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, useToast } from '../components/ui';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { dashboardHeadingDate } from '../lib/dashboardHome';
import {
  REMINDER_EMPTY_LIST,
  REMINDER_LISTS,
  REMINDER_SCOPES,
  listReminderCrew,
  listReminderJobs,
  listReminders,
  postponeReminder,
  quickCaptureReminder,
  reminderCrewNames,
  reminderInScope,
  reminderJobLabels,
  setReminderDone,
  splitReminderLists,
  type PostponeChoice,
  type ReminderList,
  type ReminderScope,
} from '../lib/reminders';
import { ReminderRow } from '../components/reminders/ReminderRow';

export function RemindersPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const companyId: string | undefined = profile?.company_id ?? undefined;
  const userId: string = profile?.id ?? '';
  const [list, setList] = useState<ReminderList>('upcoming');
  const [scope, setScope] = useState<ReminderScope>('all');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);

  const { data: reminders, isLoading, error } = useQuery({
    queryKey: ['reminders', companyId],
    queryFn: () => listReminders(companyId as string),
    enabled: !!companyId,
  });
  const { data: jobs } = useQuery({
    queryKey: ['reminders-jobs', companyId],
    queryFn: () => listReminderJobs(companyId as string),
    enabled: !!companyId,
  });
  const { data: crew } = useQuery({
    queryKey: ['reminders-crew', companyId],
    queryFn: () => listReminderCrew(companyId as string),
    enabled: !!companyId,
  });

  const jobLabels = useMemo(() => reminderJobLabels(jobs), [jobs]);
  const crewNames = useMemo(() => reminderCrewNames(crew), [crew]);
  const visible = useMemo(
    () => splitReminderLists((reminders ?? []).filter(r => reminderInScope(r, scope, userId))),
    [reminders, scope, userId],
  );
  const upcomingCount = useMemo(
    () => splitReminderLists((reminders ?? []).filter(r => reminderInScope(r, 'all', userId))).upcoming.length,
    [reminders, userId],
  );
  const counts: Record<ReminderList, number> = {
    upcoming: visible.upcoming.length,
    completed: visible.completed.length,
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['reminders'] });

  const run = async (work: () => Promise<void>) => {
    try {
      await work();
      await refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save the reminder.', 'error');
    }
  };

  const capture = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await run(async () => {
      await quickCaptureReminder({ companyId, userId, title });
      setTitle('');
    });
    setSaving(false);
    captureRef.current?.focus();
  };

  const toggleDone = (id: string, done: boolean) => void run(() => setReminderDone(id, done));
  const postpone = (id: string, choice: PostponeChoice) => void run(() => postponeReminder(id, choice));

  if (pageQueryBlocked(error)) {
    return <AppShell><PageError message="Could not load reminders" /></AppShell>;
  }

  const rows = visible[list];
  const whisper = [
    dashboardHeadingDate(),
    company?.name,
    `${upcomingCount} upcoming`,
  ].filter(Boolean).join(' · ');

  return (
    <AppShell>
      <div className="ops-page dashboard-home reminders-page" data-reminders-page="1">
        <article className="dashboard-home-sheet reminders-sheet">
          <header className="dashboard-home-sheet-bar">
            <span className="dashboard-home-mark">Reminders</span>
          </header>
          <div className="dashboard-home-sheet-body">
            <h1 className="ops-page-title dashboard-home-hero">Reminders</h1>
            <p className="dashboard-home-label dashboard-home-whisper">{whisper}</p>

            <form className="reminders-capture" onSubmit={capture}>
              <input
                ref={captureRef}
                id="reminder-capture"
                className="reminders-capture-input"
                placeholder="What do you need to remember?"
                aria-label="What do you need to remember?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn-primary dashboard-home-primary reminders-capture-add"
                disabled={!title.trim() || saving}
              >
                Add
              </button>
            </form>
            <p className="reminders-capture-hint">
              One line is enough. Date, job and details are optional and live on the reminder.
            </p>

            <div className="reminders-tabs" role="tablist">
              {REMINDER_LISTS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  data-reminders-tab={tab.key}
                  aria-selected={list === tab.key}
                  onClick={() => setList(tab.key)}
                >
                  {tab.label} <span className="reminders-count">{counts[tab.key]}</span>
                </button>
              ))}
            </div>
            <div className="reminders-scopes">
              {REMINDER_SCOPES.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  data-reminders-scope={chip.key}
                  aria-pressed={scope === chip.key}
                  onClick={() => setScope(chip.key)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : rows.length === 0 ? (
              <p className="reminders-empty">{REMINDER_EMPTY_LIST[list]}</p>
            ) : (
              <ul className="reminders-list">
                {rows.map(reminder => (
                  <ReminderRow
                    key={reminder.id}
                    reminder={reminder}
                    jobLabel={reminder.jobId ? jobLabels.get(reminder.jobId) ?? null : null}
                    ownerName={reminder.ownerId ? crewNames.get(reminder.ownerId) ?? null : null}
                    crewNames={crewNames}
                    isMine={reminder.ownerId === userId}
                    onToggleDone={toggleDone}
                    onPostpone={postpone}
                  />
                ))}
              </ul>
            )}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
