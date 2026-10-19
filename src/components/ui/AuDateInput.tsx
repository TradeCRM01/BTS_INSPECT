import { AU_DATE_PLACEHOLDER } from '../../lib/safeDate';

export function AuDateInput({
  id,
  value,
  onChange,
  required,
  error,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  error?: string | null;
}) {
  const errorId = `${id}-error`;
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={AU_DATE_PLACEHOLDER}
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-[#B42318] mt-1">{error}</p>
      ) : null}
    </>
  );
}
