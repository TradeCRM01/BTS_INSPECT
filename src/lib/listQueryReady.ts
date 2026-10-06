export const LIST_LOADING_LABEL = 'Loading…';

/** True while v5 isPending and not in error. Look seeds skip the wait. */
export function listQueryBusy(input: {
  isPending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  data: unknown;
  seeded?: boolean;
}): boolean {
  if (input.seeded) return false;
  return Boolean(input.isPending) && !input.isError;
}

/** Real empty only after the query is not busy and not in error. */
export function listShowEmpty(busy: boolean, count: number, isError = false): boolean {
  return !busy && !isError && count === 0;
}

/** Empty job/client tray copy only after the related query resolves without error. */
export function jobRelatedShowEmpty(
  loading: boolean | undefined,
  itemCount: number,
  isError = false,
): boolean {
  return !loading && !isError && itemCount === 0;
}

export function listSectionLoadError(thing: string): string {
  return `Couldn't load ${thing}.`;
}

/** Hold the job-sheet primary until the queries that pick it have settled. */
export function jobSheetHeaderPrimaryHeld(input: {
  nextKey: string;
  jhasPending?: boolean;
  jhasError?: boolean;
  inspectionsPending?: boolean;
  inspectionsError?: boolean;
  timesheetsPending?: boolean;
  timesheetsError?: boolean;
  clientPending?: boolean;
  clientError?: boolean;
}): boolean {
  if (Boolean(input.timesheetsPending) && !input.timesheetsError) return true;
  if (Boolean(input.clientPending) && !input.clientError) return true;
  if (input.nextKey === 'jha') return Boolean(input.jhasPending) && !input.jhasError;
  if (input.nextKey === 'inspect') {
    return Boolean(input.inspectionsPending) && !input.inspectionsError;
  }
  return false;
}

/** Hold the Next helper so it cannot flash Clock In while Add phone is still loading. */
export function jobSheetHeaderPrimaryDetail(
  held: boolean,
  detail: string | null | undefined,
): string {
  return held ? '' : (detail ?? '');
}

/** Identity crew: never Unassigned before team members settle. Date stays on its own row. */
export function jobSheetIdentityCrewLabel(input: {
  busy?: boolean;
  error?: boolean;
  names: string[];
}): string {
  if (input.error) return listSectionLoadError('crew');
  if (input.busy) return '…';
  return input.names.length > 0 ? input.names.join(', ') : 'Unassigned';
}

/** Hide a count while the query is still busy so 0 never flashes. */
export function listPendingCount(busy: boolean, count: number): string {
  return busy ? '…' : String(count);
}

/** e.g. "3 total contracts" — placeholder while busy. */
export function listPendingNounCount(busy: boolean, count: number, noun: string): string {
  return busy ? '…' : `${count} ${noun}`;
}

export function listCountWhisper(input: {
  busy: boolean;
  filterLabel: string;
  count: number;
  singular: string;
  plural: string;
}): string {
  if (input.busy) return LIST_LOADING_LABEL;
  const noun = input.count === 1 ? input.singular : input.plural;
  return `${input.filterLabel} · ${input.count} ${noun}`;
}
