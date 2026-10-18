import { shouldMarkInspectionIssued } from '../../lib/sendReport';

export function InspectionIssueControl({
  status,
  hasReport,
  busy = false,
  onIssue,
}: {
  status: string;
  hasReport: boolean;
  busy?: boolean;
  onIssue: () => void;
}) {
  if (!hasReport || !shouldMarkInspectionIssued(status)) return null;
  return (
    <button type="button" onClick={onIssue} disabled={busy} className="btn-primary">
      {busy ? 'Issuing…' : 'Issue'}
    </button>
  );
}
