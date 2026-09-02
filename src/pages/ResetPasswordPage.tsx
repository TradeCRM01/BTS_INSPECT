import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { BrandLockup } from '../components/brand/BrandLockup';
import { PublicLegalLinks } from '../components/legal/PublicLegalLinks';
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

  return (
    <div className="hub-auth">
      <header className="hub-auth-nav">
        <Link to="/" aria-label="Grafter">
          <BrandLockup size="marketing" />
        </Link>
      </header>
      <div className="hub-auth-card animate-slide-up">
        {done ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={24} className="text-green-600" />
              </div>
              <h1 className="hub-auth-title">Password updated</h1>
              <p className="hub-auth-lede">Your password has been changed. Redirecting you now...</p>
            </div>
          ) : linkError ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={24} className="text-orange-500" />
              </div>
              <h1 className="hub-auth-title">Link expired</h1>
              <p className="hub-auth-lede">{linkError}</p>
              <button
                onClick={() => navigate('/forgot-password')}
                className="hub-auth-submit mb-3"
              >
                Request new link
              </button>
              <Link to="/login" className="text-sm font-semibold text-accent hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : !sessionReady ? (
            <div className="text-center py-4">
              <p className="hub-auth-lede">Verifying reset link...</p>
            </div>
          ) : (
            <>
              <h1 className="hub-auth-title">Set your password</h1>
              <p className="hub-auth-lede">Choose a strong password to activate your account.</p>

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
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="hub-auth-submit">
                  {loading ? 'Updating...' : 'Set password'}
                </button>
              </form>
            </>
          )}
      </div>
      <PublicLegalLinks className="hub-auth-legal" />
    </div>
  );
}
