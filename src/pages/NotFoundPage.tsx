import { Link } from 'react-router-dom';
import { AuthShell } from '../components/auth/AuthShell';

export function NotFoundPage() {
  return (
    <AuthShell title="Page not found">
      <Link to="/" className="hub-auth-submit mt-6">Home</Link>
    </AuthShell>
  );
}
