import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Bitcoin, AlertCircle, CheckCircle } from 'lucide-react';

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
    return 'You’ve been invited to BTS Inspect. Click below to accept and set your password. This protects the invite from being used up by email scanners.';
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
    <div className="min-h-screen bg-gradient-to-br from-[#0A2540] via-[#0d2f4e] to-[#082036] flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-[#F7931A] to-[#E67E0E] rounded-xl flex items-center justify-center shadow-lg">
            <Bitcoin size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <span className="text-2xl font-semibold text-white tracking-tight">BTS Inspect</span>
            <p className="text-sm text-white/50 mt-1">Inspection & field service management</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-6">
          {done ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={24} className="text-green-600" />
              </div>
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">Invitation accepted</h1>
              <p className="text-sm text-[#4A5568]">Taking you to set your password…</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">{title}</h1>
              <p className="text-sm text-[#4A5568] mb-6">{blurb}</p>

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
                className="w-full bg-[#0A2540] text-white py-2.5 rounded-md font-medium text-sm hover:bg-[#0d2f4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
              >
                {loading ? 'Accepting…' : type === 'recovery' ? 'Continue' : 'Accept invitation'}
              </button>

              <Link to="/forgot-password" className="block text-sm text-[#2E75B6] hover:underline mb-2">
                Request a new link
              </Link>
              <Link to="/login" className="block text-sm text-[#4A5568] hover:underline">
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
