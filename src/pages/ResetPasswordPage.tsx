import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';
import { usePublicDocumentHead } from '../lib/publicSeo';

function readAuthHashError(): string | null {
  const raw = window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const code = params.get('error_code') || params.get('error');
  const desc = params.get('error_description');
  if (!code && !desc) return null;
  if (code === 'otp_expired' || /expired|invalid/i.test(desc ?? '')) {
    return 'This email link has expired or was already used. Request a new one below.';
  }
  return desc?.replace(/\+/g, ' ') || 'This email link is no longer valid.';
}

export function ResetPasswordPage() {
  usePublicDocumentHead('resetPassword');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(() => readAuthHashError());

  useEffect(() => {
    if (linkError) {
      // Drop the broken hash so refresh doesn't keep showing a browser-level failure.
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return;
    }

    if (isDevFieldAuditAuth()) {
      setSessionReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true);
      }
    });

    const timeout = setTimeout(() => {
      setSessionReady(prev => {
        if (!prev) {
          setLinkError('This link may have expired or already been used. Request a new one below.');
        }
        return prev;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [linkError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => navigate('/'), 2500);
    }
  }

  const title = done
    ? 'Password updated'
    : linkError
      ? 'Link expired'
      : 'Set your password';
  const lede = done
    ? 'Your password has been changed. Redirecting you now...'
    : linkError
      ? linkError
      : !sessionReady
        ? 'Verifying reset link...'
        : 'Choose a strong password to activate your account.';

  return (
    <AuthShell
      title={title}
      lede={lede}
      footer={linkError ? (
        <Link to="/login">Back to sign in</Link>
      ) : undefined}
    >
      {done ? null : linkError ? (
        <button
          onClick={() => navigate('/forgot-password')}
          className="hub-auth-submit"
        >
          Request new link
        </button>
      ) : !sessionReady ? null : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">New password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="form-input pr-12"
                placeholder="Min. 8 characters"
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

          <div>
            <label className="form-label">Confirm new password</label>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="form-input"
              placeholder="Re-enter password"
            />
          </div>

          {error && (
            <div className="hub-auth-note hub-auth-note-error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="hub-auth-submit">
            {loading ? 'Updating...' : 'Set password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
