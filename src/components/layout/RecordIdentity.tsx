export function RecordIdentity({
  primary,
  secondary,
  className,
}: {
  primary: string;
  secondary?: string;
  className?: string;
}) {
  return (
    <span className={['hub-record-identity', className].filter(Boolean).join(' ')}>
      <span className="hub-record-primary">{primary}</span>
      {secondary ? <span className="hub-record-secondary">{secondary}</span> : null}
    </span>
  );
}
