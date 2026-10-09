import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  browserUses12HourTime,
  isValidCompleteTimeValue,
  shouldBlockTimeFieldEnter,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
  tryInferTimeFromDigitBuffer,
} from '../../lib/timeFieldInput';

export function TimeFieldInput({
  id,
  value,
  onChange,
  onBlurCommit,
  onIncompleteAmPmChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  /** When set, parent is notified on blur (e.g. persist only after edit). */
  onBlurCommit?: (value: string) => void;
  /** True while 12-hour locale input has digits but no AM/PM segment. */
  onIncompleteAmPmChange?: (needs: boolean) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digitBufferRef = useRef('');
  const uses12Hour = useMemo(() => browserUses12HourTime(), []);
  const [needsAmPm, setNeedsAmPm] = useState(false);

  const publishIncomplete = useCallback(
    (needs: boolean) => {
      setNeedsAmPm(needs);
      onIncompleteAmPmChange?.(needs);
    },
    [onIncompleteAmPmChange],
  );

  const syncIncomplete = useCallback(
    (el: HTMLInputElement) => {
      const needs = timeFieldNeedsAmPm({
        value: el.value,
        validity: el.validity,
        digitBuffer: digitBufferRef.current,
        uses12Hour,
      });
      publishIncomplete(needs);
      el.setCustomValidity('');
    },
    [publishIncomplete, uses12Hour],
  );

  const applyDigitBuffer = useCallback(
    (el: HTMLInputElement) => {
      const inferred = tryInferTimeFromDigitBuffer(digitBufferRef.current, uses12Hour);
      if (inferred && isValidCompleteTimeValue(inferred)) {
        digitBufferRef.current = '';
        publishIncomplete(false);
        onChange(inferred);
        return inferred;
      }
      syncIncomplete(el);
      return null;
    },
    [onChange, publishIncomplete, syncIncomplete, uses12Hour],
  );

  useEffect(() => {
    if (!value) {
      digitBufferRef.current = '';
      publishIncomplete(false);
      return;
    }
    if (isValidCompleteTimeValue(value)) {
      digitBufferRef.current = '';
      publishIncomplete(false);
    }
  }, [value, publishIncomplete]);

  return (
    <div className="time-field-input-wrap">
      <input
        ref={inputRef}
        id={id}
        type="time"
        value={value}
        onInput={e => {
          const el = e.currentTarget;
          if (!el.value) {
            digitBufferRef.current = '';
          }
          if (isValidCompleteTimeValue(el.value)) {
            digitBufferRef.current = '';
            publishIncomplete(false);
          } else {
            syncIncomplete(el);
          }
          onChange(el.value);
        }}
        onChange={e => {
          const el = e.currentTarget;
          if (!el.value) {
            digitBufferRef.current = '';
            publishIncomplete(false);
          } else if (isValidCompleteTimeValue(el.value)) {
            digitBufferRef.current = '';
            publishIncomplete(false);
          } else {
            syncIncomplete(el);
          }
          onChange(el.value);
        }}
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) {
            digitBufferRef.current = `${digitBufferRef.current}${e.key}`.slice(-4);
            const el = inputRef.current;
            if (el) applyDigitBuffer(el);
          }
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onFocus={() => {
          digitBufferRef.current = '';
          publishIncomplete(false);
        }}
        onBlur={e => {
          const el = e.currentTarget;
          applyDigitBuffer(el);
          onBlurCommit?.(el.value);
        }}
        className={className}
      />
      <p
        className={`time-field-am-pm-hint text-sm text-fail mt-1${needsAmPm ? ' is-visible' : ''}`}
        role={needsAmPm ? 'alert' : undefined}
        aria-hidden={!needsAmPm}
      >
        {needsAmPm ? TIME_FIELD_ADD_AM_PM : '\u00a0'}
      </p>
    </div>
  );
}
