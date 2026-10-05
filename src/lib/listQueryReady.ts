export const LIST_LOADING_LABEL = 'Loading…';

/** True until a successful result exists. Look seeds skip the wait. */
export function listQueryBusy(input: {
  isPending?: boolean;
  isLoading?: boolean;
  data: unknown;
  seeded?: boolean;
}): boolean {
  if (input.seeded) return false;
  return Boolean(input.isPending || input.isLoading || input.data === undefined);
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
