import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email, appUrl: window.location.origin }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to send reset email');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setLoading(false);
  }

  return (
    <AuthShell
      seoKey="forgotPassword"
      title={sent ? 'Check your email' : 'Forgot password'}
      lede={sent
        ? undefined
        : 'Enter the email address for your account and we’ll send you a reset link.'}
      footer={(
        <Link to="/login" className="inline-flex items-center justify-center gap-1.5">
          <ArrowLeft size={14} />
          Back to sign in
        </Link>
      )}
    >
      {sent ? (
        <div>
          <p className="hub-auth-lede" style={{ marginTop: 0 }}>
            We sent a password reset link to <span className="font-medium text-navy">{email}</span>. Check your inbox and follow the link to reset your password.
          </p>
          <p className="text-xs text-muted">
            Didn't receive it? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-accent font-medium hover:underline"
            >
              try again
            </button>.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Email address</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="form-input"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <div className="hub-auth-note hub-auth-note-error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="hub-auth-submit">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
