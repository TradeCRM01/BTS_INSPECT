import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import {
  isValidCompleteTimeValue,
  shouldBlockTimeFieldEnter,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
} from '../../lib/timeFieldInput';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else ref.current = value;
}

export function TimeFieldInput({
  id,
  value,
  onChange,
  onBlurCommit,
  onIncompleteAmPmChange,
  inputRef,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onBlurCommit?: (value: string) => void;
  onIncompleteAmPmChange?: (needs: boolean) => void;
  inputRef?: Ref<HTMLInputElement | null>;
  className?: string;
}) {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const hasTypedDigitsRef = useRef(false);
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
        hasTypedDigits: hasTypedDigitsRef.current,
      });
      publishIncomplete(needs);
      el.setCustomValidity('');
    },
    [publishIncomplete],
  );

  const commitFromElement = useCallback(
    (el: HTMLInputElement, { blur }: { blur: boolean }) => {
      const next = el.value;
      if (isValidCompleteTimeValue(next)) {
        hasTypedDigitsRef.current = false;
      } else if (!next && !el.validity.badInput) {
        hasTypedDigitsRef.current = false;
      }
      syncIncomplete(el);
      if (next !== value) onChange(next);
      if (blur) onBlurCommit?.(next);
      return next;
    },
    [onBlurCommit, onChange, syncIncomplete, value],
  );

  useEffect(() => {
    if (isValidCompleteTimeValue(value)) {
      hasTypedDigitsRef.current = false;
      publishIncomplete(false);
    }
  }, [value, publishIncomplete]);

  return (
    <div className="time-field-input-wrap">
      <input
        ref={el => {
          localInputRef.current = el;
          assignRef(inputRef, el);
        }}
        id={id}
        type="time"
        value={value}
        onInput={e => {
          commitFromElement(e.currentTarget, { blur: false });
        }}
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) hasTypedDigitsRef.current = true;
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={e => {
          commitFromElement(e.currentTarget, { blur: true });
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
