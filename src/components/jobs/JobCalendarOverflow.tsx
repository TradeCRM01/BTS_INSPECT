import { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const preview = buildJobCalendar(job, { site, crewNames, members });

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
    if (!preview.ok) return;
    detailsRef.current && (detailsRef.current.open = false);
    downloadJobCalendar(preview);
  };

  return (
    <details
      ref={detailsRef}
      className="job-cal-more"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <summary aria-label="More">
        <MoreHorizontal size={16} />
      </summary>
      <div className="job-cal-more-menu" role="menu">
        <button type="button" role="menuitem" onClick={addToCalendar}>
          Add to calendar
        </button>
        {preview.ok ? null : (
          <p className="job-cal-miss">{preview.message}</p>
        )}
      </div>
    </details>
  );
}
