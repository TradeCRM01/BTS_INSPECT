import type { ReactNode } from 'react';

function actionClass(recommended: boolean) {
  return recommended ? 'btn-primary' : 'btn-secondary';
}

export function ActionButton({
  recommended,
  onClick,
  disabled,
  children,
}: {
  recommended: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={actionClass(recommended)}>
      {children}
    </button>
  );
}

export function NextBanner({ detail }: { detail: string }) {
  return (
    <div className="rounded-lg bg-[#F0F7FF] border border-[#BFDBFE] px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#2E75B6]">Next</p>
      <p className="text-sm font-medium text-[#0A2540] mt-0.5">{detail}</p>
    </div>
  );
}
