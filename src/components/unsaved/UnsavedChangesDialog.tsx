import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';

export function UnsavedChangesDialog({
  guard,
}: {
  guard: ReturnType<typeof useUnsavedChangesGuard>;
}) {
  if (!guard.blocked) return null;
  return (
    <ConfirmDialog
      open
      title={guard.leaveCopy.title}
      message={guard.leaveCopy.message}
      confirmLabel={guard.leaveCopy.confirmLabel}
      variant="danger"
      onConfirm={guard.proceed}
      onCancel={guard.reset}
    />
  );
}
