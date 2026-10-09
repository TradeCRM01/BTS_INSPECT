import { timeFieldInputKeyDown } from '../../lib/timeFieldInput';

export function TimeFieldInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        const handled = timeFieldInputKeyDown(value, e.key);
        if (!handled) return;
        if (handled.blockDefault) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (handled.next !== value) onChange(handled.next);
      }}
      className={className}
    />
  );
}
