import { useEffect, useRef, useState } from 'react';
import {
  AU_DATE_PLACEHOLDER,
  DATE_INVALID_MESSAGE,
  formatAuDate,
  isoDateKey,
  parseAuDate,
} from '../../lib/dateTimeIntegrity';

export function DateFieldInput({
  id,
  value,
  onChange,
  onValidityChange,
  onBlurCommit,
  onTextChange,
  className,
  disabled,
  hideAlert,
  ariaInvalid,
  ariaDescribedBy,
  requireFourDigitYear = true,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  onValidityChange?: (invalid: boolean) => void;
  onBlurCommit?: (iso: string) => void;
  onTextChange?: (raw: string) => void;
  className?: string;
  disabled?: boolean;
  hideAlert?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  requireFourDigitYear?: boolean;
}) {
  const [text, setText] = useState(() => formatAuDate(value));
  const [invalid, setInvalid] = useState(false);
  const lastEmittedRef = useRef(isoDateKey(value) ?? '');
  const focusedRef = useRef(false);
  const ownAlertId = id ? `${id}-field-error` : undefined;
  const describedBy = ariaDescribedBy || (invalid && !hideAlert ? ownAlertId : undefined);

  useEffect(() => {
    const incoming = isoDateKey(value) ?? '';
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    if (!focusedRef.current) {
      setText(formatAuDate(value));
      setInvalid(false);
    }
  }, [value]);

  const setValidity = (next: boolean) => {
    setInvalid(next);
    onValidityChange?.(next);
  };

  const emitIso = (iso: string, nextInvalid: boolean) => {
    lastEmittedRef.current = iso;
    setValidity(nextInvalid);
    onChange(iso);
  };

  return (
    <>
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
        aria-invalid={(ariaInvalid || (!hideAlert && invalid)) || undefined}
        aria-describedby={describedBy}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={e => {
          const next = e.target.value;
          setText(next);
          onTextChange?.(next);
          const trimmed = next.trim();
          if (!trimmed) {
            emitIso('', false);
            return;
          }
          const live = parseAuDate(trimmed, { requireFourDigitYear });
          if (live) {
            lastEmittedRef.current = live;
            setValidity(false);
            onChange(live);
            return;
          }
          setValidity(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          const trimmed = text.trim();
          onTextChange?.(trimmed);
          if (!trimmed) {
            setText('');
            emitIso('', false);
            onBlurCommit?.('');
            return;
          }
          const iso = parseAuDate(trimmed, { requireFourDigitYear });
          if (iso) {
            setText(formatAuDate(iso));
            emitIso(iso, false);
            onBlurCommit?.(iso);
            return;
          }
          setValidity(true);
          if (lastEmittedRef.current) emitIso('', true);
          onBlurCommit?.('');
        }}
      />
      {invalid && !hideAlert ? <p id={ownAlertId} className="text-sm text-fail" role="alert">{DATE_INVALID_MESSAGE}</p> : null}
    </>
  );
}
