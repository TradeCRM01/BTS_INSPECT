import type { ReactNode } from 'react';

export function HubPageHeader({
  title,
  whisper,
  primary,
  overflow,
}: {
  title: string;
  whisper?: string;
  primary?: ReactNode;
  overflow?: ReactNode;
}) {
  return (
    <div className="hub-page-header">
      <div className="hub-page-header-copy">
        <h1 className="ops-page-title hub-page-title">{title}</h1>
        {whisper ? <p className="hub-page-whisper">{whisper}</p> : null}
      </div>
      {(primary || overflow) && (
        <div className="hub-page-header-tools">
          {primary}
          {overflow}
        </div>
      )}
    </div>
  );
}
