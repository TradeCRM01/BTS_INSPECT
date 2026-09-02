import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/BrandLockup';
import { usePublicDocumentHead, type PublicSeoKey } from '../../lib/publicSeo';
import { PublicLegalLinks } from './PublicLegalLinks';

export function LegalShell({
  seoKey,
  title,
  children,
}: {
  seoKey: PublicSeoKey;
  title: string;
  children: ReactNode;
}) {
  usePublicDocumentHead(seoKey);
  return (
    <div className="hub-legal">
      <header className="hub-legal-nav">
        <Link to="/" aria-label="Grafter">
          <BrandLockup size="marketing" />
        </Link>
        <div className="hub-legal-nav-actions">
          <Link to="/login" className="hub-marketing-link">Sign in</Link>
          <Link to="/signup" className="hub-marketing-btn">Create a workspace</Link>
        </div>
      </header>
      <article className="hub-legal-article">
        <p className="hub-marketing-kicker">Grafter</p>
        <h1 className="hub-legal-title">{title}</h1>
        {children}
      </article>
      <footer className="hub-marketing-footer">
        <BrandLockup size="marketing" />
        <p>
          Australian-built. grafter.com.au
          {' · '}
          <PublicLegalLinks as="span" />
        </p>
      </footer>
    </div>
  );
}
