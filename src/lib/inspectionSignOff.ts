export function inspectionSignOffHasSignature(signatureUrl?: string | null): boolean {
  return Boolean(signatureUrl && signatureUrl.trim());
}

export function inspectionSignOffCopy(args: {
  hasSignature: boolean;
  name: string;
  date: string;
}): {
  badge: string;
  byLabel: string;
  dateLabel: string;
} {
  const name = args.name.trim() || 'Inspector';
  const date = args.date.trim();
  if (args.hasSignature) {
    return {
      badge: 'Digitally Signed',
      byLabel: 'Signed By',
      dateLabel: 'Date Signed',
    };
  }
  return {
    badge: date ? `Completed by ${name} on ${date}` : `Completed by ${name}`,
    byLabel: 'Completed by',
    dateLabel: 'Completed on',
  };
}
