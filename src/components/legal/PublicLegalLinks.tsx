import { Link } from 'react-router-dom';

/** Shared Privacy / Terms links on public auth and marketing chrome. Not a Documents module. */
export function PublicLegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`hub-legal-links ${className}`.trim()}>
      <Link to="/privacy">Privacy Policy</Link>
      <span aria-hidden="true"> · </span>
      <Link to="/terms">Terms of Use</Link>
    </p>
  );
}
