import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AuthShell } from '../components/auth/AuthShell';
import { usePublicDocumentHead } from '../lib/publicSeo';

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
  usePublicDocumentHead('authConfirm');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = params.get('token_hash') || params.get('token') || '';
  const type = normalizeType(params.get('type'));
  const next = params.get('next') || '/reset-password';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const title = useMemo(() => {
    if (done) return 'Invitation accepted';
    if (type === 'recovery') return 'Continue password setup';
    return 'Accept your invitation';
  }, [type, done]);

  const blurb = useMemo(() => {
    if (done) return 'Taking you to set your password…';
    if (type === 'recovery') {
      return 'Click below to securely open the password form. This step stops email scanners from using up your link.';
    }
    return 'You’ve been invited to Grafter. Click below to accept and set your password. This protects the invite from being used up by email scanners.';
  }, [type, done]);

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
    <AuthShell
      title={title}
      lede={blurb}
      footer={!done ? (
        <>
          <p>
            <Link to="/forgot-password">Request a new link</Link>
          </p>
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        </>
      ) : undefined}
    >
      {done ? null : (
        <>
          {error && (
            <div className="hub-auth-note hub-auth-note-error">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleAccept}
            disabled={loading || !tokenHash}
            className="hub-auth-submit"
          >
            {loading ? 'Accepting…' : type === 'recovery' ? 'Continue' : 'Accept invitation'}
          </button>
        </>
      )}
    </AuthShell>
  );
}
