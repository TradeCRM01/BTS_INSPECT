import { useCallback, useRef, useState } from 'react';
import {
  infer24hFrom12hTypedDigits,
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
  /** When set, parent is notified on blur (e.g. persist only after edit). */
  onBlurCommit?: (value: string) => void;
  /** True while 12-hour locale input has digits but no AM/PM segment. */
  onIncompleteAmPmChange?: (needs: boolean) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digitBufferRef = useRef('');
  const typedSinceFocusRef = useRef(false);
  const [needsAmPm, setNeedsAmPm] = useState(false);

  const syncIncomplete = useCallback(
    (el: HTMLInputElement) => {
      const needs = timeFieldNeedsAmPm(el, typedSinceFocusRef.current);
      setNeedsAmPm(needs);
      onIncompleteAmPmChange?.(needs);
      el.setCustomValidity('');
    },
    [onIncompleteAmPmChange],
  );

  return (
    <div className="time-field-input-wrap">
      <input
        ref={inputRef}
        id={id}
        type="time"
        value={value}
        onInput={e => {
          const el = e.currentTarget;
          if (isValidCompleteTimeValue(el.value)) {
            digitBufferRef.current = '';
          }
          syncIncomplete(el);
          onChange(el.value);
        }}
        onChange={e => {
          const el = e.currentTarget;
          if (isValidCompleteTimeValue(el.value)) {
            digitBufferRef.current = '';
          }
          syncIncomplete(el);
          onChange(el.value);
        }}
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) {
            typedSinceFocusRef.current = true;
            digitBufferRef.current = `${digitBufferRef.current}${e.key}`.slice(-4);
            queueMicrotask(() => {
              const el = inputRef.current;
              if (el) syncIncomplete(el);
            });
          }
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onFocus={() => {
          typedSinceFocusRef.current = false;
          digitBufferRef.current = '';
          setNeedsAmPm(false);
          onIncompleteAmPmChange?.(false);
        }}
        onBlur={e => {
          const el = e.currentTarget;
          let next = el.value;
          if (
            timeFieldNeedsAmPm(el, typedSinceFocusRef.current)
            && digitBufferRef.current.length === 4
          ) {
            const inferred = infer24hFrom12hTypedDigits(digitBufferRef.current);
            if (inferred && isValidCompleteTimeValue(inferred)) {
              next = inferred;
              onChange(inferred);
              digitBufferRef.current = '';
              typedSinceFocusRef.current = false;
              setNeedsAmPm(false);
              onIncompleteAmPmChange?.(false);
              el.setCustomValidity('');
              onBlurCommit?.(next);
              return;
            }
          }
          syncIncomplete(el);
          onBlurCommit?.(next);
        }}
        className={className}
      />
      {needsAmPm ? (
        <p className="time-field-am-pm-hint text-sm text-fail mt-1" role="alert">
          {TIME_FIELD_ADD_AM_PM}
        </p>
      ) : null}
    </div>
  );
}
