import { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useToast } from '../ui';
import {
  buildJobCalendar,
  downloadJobCalendar,
  type CalendarJob,
  type CalendarMember,
} from '../../lib/jobCalendar';

export function JobCalendarOverflow({
  job,
  site,
  crewNames,
  members,
}: {
  job: CalendarJob;
  site?: string | null;
  crewNames?: string[];
  members?: CalendarMember[];
}) {
  const { showToast } = useToast();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const node = detailsRef.current;
    if (!node) return;
    const onPointer = (event: PointerEvent) => {
      if (!node.contains(event.target as Node)) node.open = false;
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  const addToCalendar = () => {
    const built = buildJobCalendar(job, { site, crewNames, members });
    detailsRef.current && (detailsRef.current.open = false);
    if (!built.ok) {
      showToast(built.message, 'info');
      return;
    }
    downloadJobCalendar(built);
  };

  return (
    <details
      ref={detailsRef}
      className="job-swms-more job-cal-more"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <summary aria-label="More">
        <MoreHorizontal size={16} />
      </summary>
      <div className="job-swms-more-menu" role="menu">
        <button type="button" role="menuitem" onClick={addToCalendar}>
          Add to calendar
        </button>
      </div>
    </details>
  );
}
