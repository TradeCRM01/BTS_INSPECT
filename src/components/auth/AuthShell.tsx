import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/BrandLockup';

export function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="hub-auth">
      <header className="hub-auth-nav">
        <Link to="/" aria-label="Grafter">
          <BrandLockup size="marketing" />
        </Link>
      </header>
      <div className="hub-auth-card animate-slide-up">
        <h1 className="hub-auth-title">{title}</h1>
        {lede ? <p className="hub-auth-lede">{lede}</p> : null}
        {children}
      </div>
      {footer ? <div className="hub-auth-footer">{footer}</div> : null}
    </div>
  );
}
