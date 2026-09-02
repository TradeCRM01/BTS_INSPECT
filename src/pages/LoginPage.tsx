import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const expired = params.get('expired') === '1';
  const recovered = params.get('recovered') === '1';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }

    // Clear any stale session + cached storage so the anon key (not an expired token) is used
    try {
      // Remove from localStorage first so the client doesn't try to refresh a dead token
      const keys = Object.keys(localStorage).filter(k =>
        k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      keys.forEach(k => localStorage.removeItem(k));
    } catch {
      // localStorage may be unavailable
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore — session may already be invalid
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  }

  return (
    <AuthShell
      seoKey="login"
      title="Sign in to Grafter"
      lede="Welcome back. Enter your credentials to continue."
      footer={(
        <>
          <p>
            New to Grafter?{' '}
            <Link to="/signup">Create a workspace</Link>
          </p>
          <p className="mt-2">
            Invited to a team? Use the link in your invite email, or{' '}
            <Link to="/forgot-password">reset password</Link>.
          </p>
          <p className="mt-2">
            Page won’t load?{' '}
            <a href="/login?clear=1">Clear cache &amp; retry</a>
          </p>
          <p className="mt-2">
            <Link to="/privacy">Privacy Policy</Link>
            {' · '}
            <Link to="/terms">Terms of Use</Link>
          </p>
        </>
      )}
    >
      {expired && (
        <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2.5 rounded-xl text-sm">
          That email link expired or was already used. Sign in below, or use Forgot password / ask for a new invite.
        </div>
      )}
      {recovered && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2.5 rounded-xl text-sm">
          App cache cleared. You can sign in again.
        </div>
      )}

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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="form-label mb-0">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="form-input pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="hub-auth-submit">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
