import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  browserUses12HourTime,
  infer24hFrom12hNativeValue,
  isValidCompleteTimeValue,
  shouldBlockTimeFieldEnter,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
} from '../../lib/timeFieldInput';

function isExplicitMeridiemKey(key: string): boolean {
  return key === 'a' || key === 'A' || key === 'p' || key === 'P';
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set on explicit a/p keydown; cleared on blur so blur inference cannot override AM/PM choice. */
  const honorExplicitMeridiemRef = useRef(false);
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
        uses12Hour,
      });
      publishIncomplete(needs);
      el.setCustomValidity('');
    },
    [publishIncomplete, uses12Hour],
  );

  const commitFromElement = useCallback(
    (el: HTMLInputElement, { blur }: { blur: boolean }) => {
      let next = el.value;

      if (
        !honorExplicitMeridiemRef.current
        && uses12Hour
        && isValidCompleteTimeValue(next)
      ) {
        const inferred = infer24hFrom12hNativeValue(next);
        if (inferred && inferred !== next) next = inferred;
      }

      syncIncomplete(el);
      if (next !== value) onChange(next);
      if (blur) onBlurCommit?.(next);
      return next;
    },
    [onBlurCommit, onChange, syncIncomplete, uses12Hour, value],
  );

  useEffect(() => {
    if (isValidCompleteTimeValue(value)) publishIncomplete(false);
  }, [value, publishIncomplete]);

  return (
    <div className="time-field-input-wrap">
      <input
        ref={inputRef}
        id={id}
        type="time"
        value={value}
        onInput={e => {
          commitFromElement(e.currentTarget, { blur: false });
        }}
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) honorExplicitMeridiemRef.current = false;
          if (isExplicitMeridiemKey(e.key)) honorExplicitMeridiemRef.current = true;
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={e => {
          commitFromElement(e.currentTarget, { blur: true });
          honorExplicitMeridiemRef.current = false;
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
