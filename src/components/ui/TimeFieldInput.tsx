import { shouldBlockTimeFieldEnter } from '../../lib/timeFieldInput';

export function TimeFieldInput({
  id,
  value,
  onChange,
  onBlurCommit,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  /** When set, parent is notified on blur (e.g. persist only after edit). */
  onBlurCommit?: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (!shouldBlockTimeFieldEnter(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onBlur={e => onBlurCommit?.(e.target.value)}
      className={className}
    />
  );
}
