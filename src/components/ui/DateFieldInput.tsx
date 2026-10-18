import { useEffect, useState } from 'react';
import { AU_DATE_PLACEHOLDER, formatAuDate, parseAuDate } from '../../lib/dateTimeIntegrity';

export function DateFieldInput({
  id,
  value,
  onChange,
  className,
  disabled,
  required,
  name,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
}) {
  const [text, setText] = useState(() => formatAuDate(value));

  useEffect(() => {
    setText(formatAuDate(value));
  }, [value]);

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      lang="en-AU"
      placeholder={AU_DATE_PLACEHOLDER}
      data-date-field="au"
      className={className}
      disabled={disabled}
      required={required}
      value={text}
      onChange={e => {
        const next = e.target.value;
        setText(next);
        const trimmed = next.trim();
        if (!trimmed) {
          onChange('');
          return;
        }
        const iso = parseAuDate(trimmed);
        if (iso) onChange(iso);
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          onChange('');
        }
      }}
      onBlur={() => {
        const iso = parseAuDate(text);
        if (iso) {
          onChange(iso);
          setText(formatAuDate(iso));
          return;
        }
        if (!text.trim()) {
          onChange('');
          setText('');
        }
      }}
    />
  );
}
