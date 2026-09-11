import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Lock, Users } from 'lucide-react';
import {
  POSTPONE_CHOICES,
  reminderDueLabel,
  reminderInitials,
  reminderMetaLine,
  type PostponeChoice,
  type Reminder,
} from '../../lib/reminders';

const TAGGED_CHIP_LIMIT = 3;

export function ReminderRow({
  reminder,
  jobLabel,
  ownerName,
  crewNames,
  isMine,
  canTick,
  now,
  onToggleDone,
  onPostpone,
}: {
  reminder: Reminder;
  jobLabel: string | null;
  ownerName: string | null;
  crewNames: Map<string, string>;
  isMine: boolean;
  canTick: boolean;
  now?: Date;
  onToggleDone: (id: string, done: boolean) => void;
  onPostpone: (id: string, choice: PostponeChoice) => void;
}) {
  const postponeRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = postponeRef.current;
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const onToggle = () => {
      if (menu.open) document.addEventListener('pointerdown', onPointer);
      else document.removeEventListener('pointerdown', onPointer);
    };
    menu.addEventListener('toggle', onToggle);
    return () => {
      menu.removeEventListener('toggle', onToggle);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const meta = reminderMetaLine({
    jobLabel,
    dueLabel: reminderDueLabel(reminder.dueAt, now ?? new Date()),
    ownerName,
    isMine,
    visibility: reminder.visibility,
  });
  const VisibilityIcon = reminder.visibility === 'company' ? Users : Lock;

  const postpone = (choice: PostponeChoice) => {
    if (postponeRef.current) postponeRef.current.open = false;
    onPostpone(reminder.id, choice);
  };

  return (
    <li
      className={`reminders-row${reminder.completed ? ' is-done' : ''}`}
      data-reminder-id={reminder.id}
      data-visibility={reminder.visibility}
    >
      <button
        type="button"
        className="reminders-tick"
        aria-label={canTick ? 'Mark as done' : 'Only the owner or a tagged teammate can mark this done'}
        aria-pressed={reminder.completed}
        disabled={!canTick}
        onClick={() => onToggleDone(reminder.id, !reminder.completed)}
      >
        {reminder.completed && <Check size={14} strokeWidth={3} />}
      </button>
      <Link to={`/reminders/${reminder.id}`} className="reminders-body">
        <span className="reminders-title">{reminder.title}</span>
        <span className="reminders-meta">{meta}</span>
      </Link>
      <span className="reminders-tagged">
        {reminder.taggedUserIds.slice(0, TAGGED_CHIP_LIMIT).map(id => (
          <span key={id} className="reminders-chip" title={crewNames.get(id) ?? ''}>
            {reminderInitials(crewNames.get(id))}
          </span>
        ))}
      </span>
      <span
        className="reminders-vis"
        data-visibility={reminder.visibility}
        aria-label={reminder.visibility === 'company' ? 'Company' : 'Private'}
      >
        <VisibilityIcon size={14} />
      </span>
      {isMine && (
        <details ref={postponeRef} className="reminders-postpone">
          <summary className="reminders-clock" aria-label="Postpone">
            <Clock size={16} />
          </summary>
          <div className="reminders-postpone-menu" role="menu">
            {POSTPONE_CHOICES.map(choice => (
              <button
                key={choice.key}
                type="button"
                role="menuitem"
                data-postpone={choice.key}
                onClick={() => postpone(choice.key)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}
