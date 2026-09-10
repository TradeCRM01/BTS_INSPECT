export function BookingWarningBanner({
  warnings,
  onBookAnyway,
  onDismiss,
}: {
  warnings: string[];
  onBookAnyway: () => void;
  onDismiss: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="ops-card px-3 py-3 mb-3" role="status">
      <p className="ops-section-title">Check this booking</p>
      <ul className="ops-meta mt-1 space-y-1">
        {warnings.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn-primary" onClick={onBookAnyway}>
          Book anyway
        </button>
        <button type="button" className="btn-secondary" onClick={onDismiss}>
          Keep editing
        </button>
      </div>
    </div>
  );
}
