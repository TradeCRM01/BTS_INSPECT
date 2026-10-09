import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { timeFieldRendersMeridiem } from '../../lib/timeFieldMeridiemProbe';
import {
  isValidCompleteTimeValue,
  shouldBlockTimeFieldEnter,
  timeFieldHintKind,
  timeFieldHintMessage,
  timeFieldHintRendersLine,
  type TimeFieldHintKind,
} from '../../lib/timeFieldInput';
import {
  applyTimeFieldSegmentBackspace,
  applyTimeFieldSegmentDigit,
  applyTimeFieldSegmentDigitBatch,
  clearTimeFieldSegmentClickLayoutCache,
  createTimeFieldSegmentState,
  measureTimeFieldSegmentClickLayout,
  shiftTimeFieldSegmentActive,
  timeFieldSegmentFromClientX,
  timeFieldSegmentProgressFromState,
  type TimeFieldSegment,
  type TimeFieldSegmentState,
} from '../../lib/timeFieldSegmentFocus';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as { current: T | null }).current = value;
}

function countDigitsInText(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

function isMeridiemKey(key: string): boolean {
  return /^[aApP]$/.test(key);
}

export function TimeFieldInput({
  id,
  value,
  onChange,
  onBlurCommit,
  onTimeFieldHintChange,
  inputRef,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onBlurCommit?: (value: string) => void;
  onTimeFieldHintChange?: (hint: TimeFieldHintKind) => void;
  inputRef?: Ref<HTMLInputElement | null>;
  className?: string;
}) {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const segmentStateRef = useRef<TimeFieldSegmentState>(createTimeFieldSegmentState());
  const meridiemEngagedRef = useRef(false);
  const [hintKind, setHintKind] = useState<TimeFieldHintKind>('none');
  const [rendersMeridiem, setRendersMeridiem] = useState(false);

  useEffect(() => {
    setRendersMeridiem(timeFieldRendersMeridiem());
  }, []);

  const publishHint = useCallback(
    (hint: TimeFieldHintKind) => {
      setHintKind(hint);
      onTimeFieldHintChange?.(hint);
    },
    [onTimeFieldHintChange],
  );

  const syncHint = useCallback(
    (el: HTMLInputElement) => {
      const hint = timeFieldHintKind({
        value: el.value,
        validity: el.validity,
        segments: timeFieldSegmentProgressFromState(segmentStateRef.current),
        rendersMeridiem,
        meridiemEngagedSinceFocus: meridiemEngagedRef.current,
      });
      publishHint(hint);
      el.setCustomValidity('');
    },
    [publishHint, rendersMeridiem],
  );

  const resetTypingSession = useCallback(() => {
    segmentStateRef.current = createTimeFieldSegmentState();
    meridiemEngagedRef.current = false;
    const el = localInputRef.current;
    if (el) clearTimeFieldSegmentClickLayoutCache(el);
  }, []);

  const setActiveSegment = useCallback((segment: TimeFieldSegment) => {
    segmentStateRef.current = { ...segmentStateRef.current, active: segment };
  }, []);

  const commitFromElement = useCallback(
    (el: HTMLInputElement, { blur }: { blur: boolean }) => {
      const next = el.value;
      if (isValidCompleteTimeValue(next)) {
        resetTypingSession();
      } else if (!next && !el.validity.badInput) {
        resetTypingSession();
      }
      syncHint(el);
      if (next !== value) onChange(next);
      if (blur) onBlurCommit?.(next);
      return next;
    },
    [onBlurCommit, onChange, resetTypingSession, syncHint, value],
  );

  useEffect(() => {
    if (isValidCompleteTimeValue(value)) {
      resetTypingSession();
      publishHint('none');
    }
  }, [value, publishHint, resetTypingSession]);

  useEffect(() => {
    const el = localInputRef.current;
    if (el) syncHint(el);
  }, [rendersMeridiem, syncHint]);

  const showHint = hintKind !== 'none';
  const hintText = showHint ? (timeFieldHintMessage(hintKind) ?? '') : '\u00a0';
  const renderHintLine = timeFieldHintRendersLine(rendersMeridiem, hintKind);

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
        onPointerDown={e => {
          if (e.button !== 0) return;
          const el = e.currentTarget;
          clearTimeFieldSegmentClickLayoutCache(el);
          const layout = measureTimeFieldSegmentClickLayout(el);
          setActiveSegment(timeFieldSegmentFromClientX(el, e.clientX, rendersMeridiem, layout));
        }}
        onFocus={() => {
          const el = localInputRef.current;
          if (el) syncHint(el);
        }}
        onInput={e => {
          const ie = e.nativeEvent as InputEvent;
          const pastedDigits = ie.data ? countDigitsInText(ie.data) : 0;
          if (pastedDigits > 1) {
            segmentStateRef.current = applyTimeFieldSegmentDigitBatch(
              segmentStateRef.current,
              rendersMeridiem,
              pastedDigits,
            );
          }
          commitFromElement(e.currentTarget, { blur: false });
        }}
        onKeyDown={e => {
          const el = e.currentTarget;
          if (isMeridiemKey(e.key)) {
            meridiemEngagedRef.current = true;
            setActiveSegment('meridiem');
          }
          if (e.key === 'ArrowLeft') {
            setActiveSegment(shiftTimeFieldSegmentActive(
              segmentStateRef.current.active,
              'left',
              rendersMeridiem,
            ));
          }
          if (e.key === 'ArrowRight') {
            setActiveSegment(shiftTimeFieldSegmentActive(
              segmentStateRef.current.active,
              'right',
              rendersMeridiem,
            ));
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            segmentStateRef.current = applyTimeFieldSegmentBackspace(segmentStateRef.current);
            syncHint(el);
          }
          if (/^\d$/.test(e.key)) {
            segmentStateRef.current = applyTimeFieldSegmentDigit(
              segmentStateRef.current,
              rendersMeridiem,
            );
            syncHint(el);
          }
          if (!shouldBlockTimeFieldEnter(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={e => {
          commitFromElement(e.currentTarget, { blur: true });
        }}
        className={className}
      />
      {renderHintLine ? (
        <p
          className={`time-field-am-pm-hint text-sm text-fail mt-1${showHint ? ' is-visible' : ''}`}
          role={showHint ? 'alert' : undefined}
          aria-hidden={!showHint}
        >
          {hintText}
        </p>
      ) : null}
    </div>
  );
}
