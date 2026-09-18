export type ScheduleBoardSummaryStatus = 'loading' | 'retained' | 'ready';

export function scheduleBoardSummary(args: {
  status: ScheduleBoardSummaryStatus;
  onBoardCount: number;
  unassignedOnBoard: number;
  needsDateCount: number;
  attentionCount: number;
}): string {
  if (args.status === 'loading') return 'Loading the board?';
  const parts = [
    `${args.onBoardCount} on the board`,
    args.unassignedOnBoard > 0 ? `${args.unassignedOnBoard} unassigned` : null,
    args.needsDateCount > 0 ? `${args.needsDateCount} without a date` : null,
    args.attentionCount > 0 ? `${args.attentionCount} need attention` : null,
  ].filter(Boolean);
  const body = parts.join(' · ');
  if (args.status === 'retained') return `Showing last view · loading? · ${body}`;
  return body;
}
