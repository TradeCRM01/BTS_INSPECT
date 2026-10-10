import type { ButtonHTMLAttributes } from 'react';

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'aria-checked' | 'onClick'>;

/** Existing Accounting on/off. 44×24 track, 44px hit from the row. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={['acct-switch', checked ? 'is-on' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className="acct-switch-knob" />
    </button>
  );
}
