import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  browserUses12HourTime,
  isValidCompleteTimeValue,
  shouldBlockTimeFieldEnter,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
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
  onBlurCommit?: (value: string) => void;
  onIncompleteAmPmChange?: (needs: boolean) => void;
  className?: string;
}) {
  const uses12Hour = useMemo(() => browserUses12HourTime(), []);
  const incompleteTouchRef = useRef(false);
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
        uses12Hour,
        incompleteTouch: incompleteTouchRef.current,
      });
      publishIncomplete(needs);
      el.setCustomValidity('');
    },
    [publishIncomplete, uses12Hour],
  );

  const commitFromElement = useCallback(
    (el: HTMLInputElement, { blur }: { blur: boolean }) => {
      const next = el.value;
      if (!isValidCompleteTimeValue(next)) incompleteTouchRef.current = true;
      else incompleteTouchRef.current = false;
      syncIncomplete(el);
      if (next !== value) onChange(next);
      if (blur) onBlurCommit?.(next);
      return next;
    },
    [onBlurCommit, onChange, syncIncomplete, value],
  );

  useEffect(() => {
    if (isValidCompleteTimeValue(value)) {
      incompleteTouchRef.current = false;
      publishIncomplete(false);
    }
  }, [value, publishIncomplete]);

  return (
    <div className="time-field-input-wrap">
      <input
        id={id}
        type="time"
        value={value}
        onInput={e => {
          commitFromElement(e.currentTarget, { blur: false });
        }}
        onFocus={() => {
          incompleteTouchRef.current = false;
        }}
        onKeyDown={e => {
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={e => {
          commitFromElement(e.currentTarget, { blur: true });
        }}
        className={className}
      />
      {uses12Hour ? (
        <p
          className={`time-field-am-pm-hint text-sm text-fail mt-1${needsAmPm ? ' is-visible' : ''}`}
          role={needsAmPm ? 'alert' : undefined}
          aria-hidden={!needsAmPm}
        >
          {needsAmPm ? TIME_FIELD_ADD_AM_PM : '\u00a0'}
        </p>
      ) : null}
    </div>
  );
}
