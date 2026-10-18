export type InspectionListConfirmKind = 'delete' | 'archive' | 'restore';

export function inspectionListConfirmCopy(args: {
  kind: InspectionListConfirmKind;
  status: string;
  site?: string;
}): { title: string; message: string; confirmLabel: string } {
  const issued = args.status === 'issued' || args.status === 'sent';
  const site = (args.site ?? '').trim();
  const named = site ? ` “${site}”` : '';

  if (args.kind === 'delete') {
    return {
      title: issued ? 'Delete this issued inspection?' : 'Delete this inspection?',
      message: issued
        ? `This inspection${named} has already been issued. Deleting it cannot be undone and the client-facing record will be gone.`
        : `Delete this inspection${named}? This cannot be undone.`,
      confirmLabel: 'Delete',
    };
  }

  if (args.kind === 'restore') {
    return {
      title: 'Restore this inspection?',
      message: `Move this inspection${named} back onto the open list.`,
      confirmLabel: 'Restore',
    };
  }

  return {
    title: issued ? 'Archive this issued inspection?' : 'Archive this inspection?',
    message: issued
      ? `This inspection${named} has already been issued. Archive it only if you still need to find it later. It will leave the open list.`
      : `Archive this inspection${named}? You can find it again under Archived.`,
    confirmLabel: 'Archive',
  };
}
