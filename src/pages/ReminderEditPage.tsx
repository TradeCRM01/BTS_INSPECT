import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Lock, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, useToast } from '../components/ui';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import {
  REMINDER_ACCESS_NOTE,
  REMINDER_DELETED,
  REMINDER_NOT_YOURS,
  REMINDER_SAVED,
  canSeeReminder,
  reminderAccess,
  deleteReminder,
  formatReminderJobOption,
  getReminder,
  listReminderCrew,
  listReminderJobs,
  reminderDueFromInputs,
  reminderDueInputs,
  reminderVisibilityNote,
  saveReminder,
  setReminderDone,
  type Reminder,
  type ReminderCrewMember,
  type ReminderJobOption,
  type ReminderVisibility,
} from '../lib/reminders';

export function ReminderEditPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const companyId: string | undefined = profile?.company_id ?? undefined;
  const userId: string = profile?.id ?? '';

  const { data: reminder, isLoading, error } = useQuery({
    queryKey: ['reminder', id],
    queryFn: () => getReminder(id as string),
    enabled: !!id,
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

  if (pageQueryBlocked(error)) {
    return <AppShell><PageError message="Could not load this reminder" /></AppShell>;
  }
  if (isLoading) {
    return <AppShell><div className="flex justify-center py-16"><LoadingSpinner /></div></AppShell>;
  }
  if (!reminder || !canSeeReminder(reminder, userId)) {
    return <AppShell><PageError message={REMINDER_NOT_YOURS} /></AppShell>;
  }

  return (
    <AppShell>
      <ReminderEditSheet
        key={reminder.id}
        reminder={reminder}
        jobs={jobs ?? []}
        crew={crew ?? []}
        userId={userId}
      />
    </AppShell>
  );
}

function ReminderEditSheet({
  reminder,
  jobs,
  crew,
  userId,
}: {
  reminder: Reminder;
  jobs: ReminderJobOption[];
  crew: ReminderCrewMember[];
  userId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useAuth();
  const { showToast } = useToast();
  const access = reminderAccess(reminder, userId);
  const isOwner = access === 'owner';
  const ownerName = crew.find(member => member.id === reminder.ownerId)?.name ?? 'The owner';
  const seeded = reminderDueInputs(reminder.dueAt);
  const [title, setTitle] = useState(reminder.title);
  const [details, setDetails] = useState(reminder.details);
  const [jobId, setJobId] = useState(reminder.jobId ?? '');
  const [date, setDate] = useState(seeded.date);
  const [time, setTime] = useState(seeded.time);
  const [visibility, setVisibility] = useState<ReminderVisibility>(reminder.visibility);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>(reminder.taggedUserIds);
  const [busy, setBusy] = useState(false);

  const teammates = crew.filter(member => member.id !== userId);
  const note = reminderVisibilityNote({ visibility, taggedUserIds }, company?.name);
  const NoteIcon = visibility === 'company' ? Users : Lock;

  const leave = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['reminders'] });
    await queryClient.invalidateQueries({ queryKey: ['reminder', reminder.id] });
    showToast(message);
    navigate('/reminders');
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save the reminder.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    await saveReminder(reminder.id, {
      title,
      details,
      jobId: jobId || null,
      dueAt: reminderDueFromInputs(date, time),
      visibility,
      taggedUserIds,
    });
    await leave(REMINDER_SAVED);
  });

  const toggleDone = () => run(async () => {
    await setReminderDone(reminder.id, !reminder.completed);
    await leave(reminder.completed ? 'Reminder back on the list' : 'Reminder done');
  });

  const remove = () => {
    if (!window.confirm('Delete this reminder?')) return;
    void run(async () => {
      await deleteReminder(reminder.id);
      await leave(REMINDER_DELETED);
    });
  };

  const toggleTag = (memberId: string) => {
    setTaggedUserIds(ids => (ids.includes(memberId) ? ids.filter(x => x !== memberId) : [...ids, memberId]));
  };

  return (
    <div className="ops-page dashboard-home reminders-page" data-reminder-edit={reminder.id}>
      <article className="dashboard-home-sheet reminders-sheet is-edit">
        <header className="dashboard-home-sheet-bar">
          <span className="dashboard-home-mark">Reminders</span>
        </header>
        <div className="dashboard-home-sheet-body">
          <Link to="/reminders" className="reminders-back">‹ Reminders</Link>
          <h1 className="ops-page-title dashboard-home-hero">{isOwner ? 'Edit reminder' : 'Reminder'}</h1>
          {!isOwner && (
            <p className="reminders-access-note" data-reminder-access={access}>
              {REMINDER_ACCESS_NOTE[access](ownerName)}
            </p>
          )}

          <label className="reminders-field-label" htmlFor="reminder-title">What do you need to remember?</label>
          <textarea
            id="reminder-title"
            className="reminders-field"
            rows={2}
            value={title}
            disabled={!isOwner}
            onChange={e => setTitle(e.target.value)}
          />

          <label className="reminders-field-label" htmlFor="reminder-job">Linked job</label>
          <select
            id="reminder-job"
            className="reminders-field"
            value={jobId}
            disabled={!isOwner}
            onChange={e => setJobId(e.target.value)}
          >
            <option value="">No linked job</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{formatReminderJobOption(job)}</option>
            ))}
          </select>

          <label className="reminders-field-label" htmlFor="reminder-details">Details</label>
          <textarea
            id="reminder-details"
            className="reminders-field"
            rows={3}
            value={details}
            disabled={!isOwner}
            onChange={e => setDetails(e.target.value)}
          />

          <div className="reminders-when">
            <div>
              <label className="reminders-field-label" htmlFor="reminder-date">Date · optional</label>
              <input
                id="reminder-date"
                type="date"
                className="reminders-field"
                value={date}
                disabled={!isOwner}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="reminders-field-label" htmlFor="reminder-time">Time</label>
              <input
                id="reminder-time"
                type="time"
                className="reminders-field"
                value={time}
                disabled={!isOwner}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>
          {isOwner && date && (
            <button
              type="button"
              className="reminder-remove-date reminders-link"
              onClick={() => { setDate(''); setTime(''); }}
            >
              Remove date
            </button>
          )}

          <section className="reminders-sharing">
            <h2 className="reminders-eyebrow">Sharing</h2>
            <fieldset className="reminders-visibility" disabled={!isOwner}>
              <legend>Who can see this</legend>
              <label>
                <input
                  type="radio"
                  name="reminder-visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                Private <span>Only you and anyone you tag</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="reminder-visibility"
                  value="company"
                  checked={visibility === 'company'}
                  onChange={() => setVisibility('company')}
                />
                Company <span>Everyone at {company?.name || 'your company'}</span>
              </label>
            </fieldset>

            <div className="reminders-tag">
              <span className="reminders-field-label">Tag teammates</span>
              {teammates.length === 0 ? (
                <p className="reminders-tag-empty">No teammates yet. Invite them from Team settings.</p>
              ) : (
                <div className="reminders-tag-chips">
                  {teammates.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      data-reminder-tag={member.id}
                      aria-pressed={taggedUserIds.includes(member.id)}
                      disabled={!isOwner}
                      onClick={() => toggleTag(member.id)}
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="reminders-actions">
            {isOwner && (
              <button
                type="button"
                className="btn-primary dashboard-home-primary reminder-save"
                disabled={busy || !title.trim()}
                onClick={() => void save()}
              >
                Save changes <Check size={16} />
              </button>
            )}
            {access !== 'viewer' && (
              <button
                type="button"
                className={`reminder-done ${isOwner ? 'reminders-secondary' : 'btn-primary dashboard-home-primary'}`}
                disabled={busy}
                onClick={() => void toggleDone()}
              >
                <CheckCircle2 size={16} /> {reminder.completed ? 'Mark as not done' : 'Mark as done'}
              </button>
            )}
          </div>
          <p className="reminder-visibility-note"><NoteIcon size={14} /> {note}</p>
          {isOwner && (
            <button type="button" className="reminder-delete reminders-link is-danger" disabled={busy} onClick={remove}>
              Delete reminder
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
