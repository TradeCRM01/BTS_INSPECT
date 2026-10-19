export const FINALISED_INSPECTION_STATUSES = [
  'completed',
  'issued',
  'sent',
  'archived',
] as const;

export type FinalisedInspectionStatus = (typeof FINALISED_INSPECTION_STATUSES)[number];

export const FINALISED_INSPECTION_STATUS_IN = '(completed,issued,sent,archived)';

export function isFinalisedInspection(
  status?: string | null,
  archived?: boolean | null,
): boolean {
  if (archived) return true;
  return status === 'completed'
    || status === 'issued'
    || status === 'sent'
    || status === 'archived';
}
