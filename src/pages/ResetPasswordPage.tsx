import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Bitcoin, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Check if a session already exists (hash may have been processed before mount)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // Listen for both events:
    // - PASSWORD_RECOVERY: password reset flow
    // - SIGNED_IN: invite acceptance flow (Supabase fires SIGNED_IN for invite links)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true);
      }
    });

    // Fallback: if no session after 8s, the link may be expired or invalid
    const timeout = setTimeout(() => {
      setSessionReady(prev => {
        if (!prev) setTimedOut(true);
        return prev;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

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
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">Password updated</h1>
              <p className="text-sm text-[#4A5568]">Your password has been changed. Redirecting you now...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center py-4">
              {timedOut ? (
                <>
                  <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle size={24} className="text-orange-500" />
                  </div>
                  <h1 className="text-base font-semibold text-[#1A1A1A] mb-2">Link expired or invalid</h1>
                  <p className="text-sm text-[#4A5568] mb-4">
                    This link may have expired or already been used. Request a new one below.
                  </p>
                  <button
                    onClick={() => navigate('/forgot-password')}
                    className="w-full bg-[#0A2540] text-white py-2.5 rounded-md font-medium text-sm hover:bg-[#0d2f4e] transition-colors"
                  >
                    Request new link
                  </button>
                </>
              ) : (
                <p className="text-sm text-[#4A5568]">Verifying reset link...</p>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-1">Set your password</h1>
              <p className="text-sm text-[#4A5568] mb-6">Choose a strong password to activate your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 pr-10 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568]"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Confirm new password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
                    placeholder="Re-enter password"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0A2540] text-white py-2.5 rounded-md font-medium text-sm hover:bg-[#0d2f4e] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                >
                  {loading ? 'Updating...' : 'Set password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
