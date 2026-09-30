export function RecordIdentity({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}) {
  return (
    <span className="hub-record-identity">
      <span className="hub-record-primary">{primary}</span>
      {secondary ? <span className="hub-record-secondary">{secondary}</span> : null}
    </span>
  );
}
