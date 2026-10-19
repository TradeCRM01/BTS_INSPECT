export const INSPECTION_ARCHIVE_RESTORE_BLOCKED =
  'This inspection is finished and cannot be restored from archive. Contact the office to amend.';

export function inspectionArchiveFailCopy(
  err: { message?: string | null; code?: string | null } | null | undefined,
): string {
  const raw = String(err?.message ?? '').trim();
  const code = String(err?.code ?? '');
  if (
    code === 'P0001'
    || /cannot be restored from archive/i.test(raw)
    || /cannot move to a non-finalised/i.test(raw)
    || /cannot change printed content/i.test(raw)
  ) {
    return INSPECTION_ARCHIVE_RESTORE_BLOCKED;
  }
  return raw || 'Could not update archive.';
}
