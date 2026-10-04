import {
  parseScheduleDateParam,
  parseScheduleView,
  scheduleDateKey,
  type ScheduleViewMode,
} from './scheduleBoard';

export function scheduleSearchFromState(
  current: URLSearchParams,
  mode: ScheduleViewMode,
  date: Date,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set('date', scheduleDateKey(date));
  if (mode === 'week') next.delete('view');
  else next.set('view', 'day');
  return next;
}

export function scheduleStateFromSearch(search: URLSearchParams): {
  date: Date | null;
  view: ScheduleViewMode;
} {
  return {
    date: parseScheduleDateParam(search.get('date')),
    view: parseScheduleView(search.get('view')),
  };
}

export function shouldWriteScheduleSearch(current: URLSearchParams, next: URLSearchParams): boolean {
  return current.toString() !== next.toString();
}

export type ScheduleNavKind = 'user' | 'popstate' | 'hydrate';

/** URL is the source of truth. User actions write. Browser history only reads. */
export function scheduleLocationStep(args: {
  kind: ScheduleNavKind;
  currentSearch: string;
  mode: ScheduleViewMode;
  date: Date;
  urlDate: string | null;
  missingDate: boolean;
}): { write: boolean; replace: boolean; readDate: boolean } {
  if (args.kind === 'popstate') {
    return { write: false, replace: false, readDate: true };
  }
  if (args.kind === 'hydrate') {
    return { write: args.missingDate, replace: true, readDate: !args.missingDate };
  }
  const next = scheduleSearchFromState(new URLSearchParams(args.currentSearch), args.mode, args.date);
  return {
    write: shouldWriteScheduleSearch(new URLSearchParams(args.currentSearch), next),
    replace: false,
    readDate: false,
  };
}
