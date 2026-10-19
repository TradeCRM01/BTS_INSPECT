import { useEffect, useState } from 'react';
import { AU_DATE_PLACEHOLDER, formatAuDate, parseAuDate } from '../../lib/dateTimeIntegrity';

export function DateFieldInput({
  id,
  value,
  onChange,
  onValidityChange,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  onValidityChange?: (invalid: boolean) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatAuDate(value));

  useEffect(() => {
    setText(formatAuDate(value));
  }, [value]);

  const emit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) {
      onValidityChange?.(false);
      onChange('');
      return;
    }
    const iso = parseAuDate(trimmed);
    if (iso) {
      onValidityChange?.(false);
      onChange(iso);
      return;
    }
    onValidityChange?.(true);
    onChange('');
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      lang="en-AU"
      placeholder={AU_DATE_PLACEHOLDER}
      data-date-field="au"
      className={className}
      disabled={disabled}
      value={text}
      onChange={e => {
        const next = e.target.value;
        setText(next);
        emit(next);
      }}
      onBlur={() => {
        const iso = parseAuDate(text);
        if (iso) {
          onValidityChange?.(false);
          onChange(iso);
          setText(formatAuDate(iso));
          return;
        }
        if (!text.trim()) {
          onValidityChange?.(false);
          onChange('');
          setText('');
          return;
        }
        onValidityChange?.(true);
        onChange('');
      }}
    />
  );
}
