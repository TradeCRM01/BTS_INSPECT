import { format } from 'date-fns';

export function safetySignOffLine(args: {
  name?: string | null;
  when?: string | null;
}): string {
  const name = (args.name ?? '').trim();
  const when = (args.when ?? '').trim();
  if (name && when) return `Signed ${name} · ${when}`;
  if (name) return `Signed ${name}`;
  if (when) return `Signed ${when}`;
  return 'Signed';
}

export function crewSignConfirmCopy(signedAt: string | null | undefined): string {
  const when = (signedAt ?? '').trim();
  if (!when) return 'Signed. Thank you.';
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return 'Signed. Thank you.';
  return `Signed ${format(date, 'd MMM yyyy HH:mm')}. Thank you.`;
}
