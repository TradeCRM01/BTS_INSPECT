import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { BrandLockup } from '../components/brand/BrandLockup';

type OtpType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email';

function normalizeType(raw: string | null): OtpType {
  const t = (raw || 'invite').toLowerCase();
  if (t === 'invite' || t === 'recovery' || t === 'signup' || t === 'magiclink' || t === 'email') {
    return t;
  }
  // Supabase sometimes sends "email" for confirmations
  return 'invite';
}

/**
 * Email clients / security scanners often prefetch invite links and burn the OTP.
 * This page does NOT verify on load — only when the user clicks Accept.
 */
export function AuthConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = params.get('token_hash') || params.get('token') || '';
  const type = normalizeType(params.get('type'));
  const next = params.get('next') || '/reset-password';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const title = useMemo(() => {
    if (type === 'recovery') return 'Continue password setup';
    return 'Accept your invitation';
  }, [type]);

  const blurb = useMemo(() => {
    if (type === 'recovery') {
      return 'Click below to securely open the password form. This step stops email scanners from using up your link.';
    }
    return 'You’ve been invited to Grafter. Click below to accept and set your password. This protects the invite from being used up by email scanners.';
  }, [type]);

  async function handleAccept() {
    setError('');
    if (!tokenHash) {
      setError('This invitation link is missing its security token. Ask your admin to resend the invite.');
      return;
    }
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    setLoading(false);
    if (verifyError) {
      const msg = verifyError.message || 'Could not accept invitation';
      if (/expired|invalid|otp/i.test(msg)) {
        setError('This invitation link has expired or was already used. Ask your admin to resend it, or use Forgot password on the sign-in page.');
      } else {
        setError(msg);
      }
      return;
    }
    setDone(true);
    setTimeout(() => navigate(next, { replace: true }), 600);
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
              <h1 className="hub-auth-title">Invitation accepted</h1>
              <p className="hub-auth-lede">Taking you to set your password…</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <h1 className="hub-auth-title">{title}</h1>
              <p className="hub-auth-lede">{blurb}</p>

              {error && (
                <div className="flex items-start gap-2 text-left bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-md text-sm mb-4">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleAccept}
                disabled={loading || !tokenHash}
                className="hub-auth-submit mb-3"
              >
                {loading ? 'Accepting…' : type === 'recovery' ? 'Continue' : 'Accept invitation'}
              </button>

              <Link to="/forgot-password" className="block text-sm font-semibold text-accent hover:underline mb-2">
                Request a new link
              </Link>
              <Link to="/login" className="block text-sm text-muted hover:underline">
                Back to sign in
              </Link>
            </div>
          )}
      </div>
    </div>
  );
}
