import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bitcoin, ArrowLeft, Mail } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-[#0A2540] via-[#0d2f4e] to-[#082036] flex items-center justify-center px-4 py-8">
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
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-[#D6E8F7] rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={22} className="text-[#2E75B6]" />
              </div>
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">Check your email</h1>
              <p className="text-sm text-[#4A5568] mb-6">
                We sent a password reset link to <span className="font-medium text-[#1A1A1A]">{email}</span>. Check your inbox and follow the link to reset your password.
              </p>
              <p className="text-xs text-[#4A5568]">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-[#2E75B6] font-medium hover:underline"
                >
                  try again
                </button>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-[#1A1A1A] mb-1">Forgot password</h1>
              <p className="text-sm text-[#4A5568] mb-6">
                Enter the email address for your account and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Email address</label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
                    placeholder="you@example.com"
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
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <Link
          to="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-white/60 mt-4 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
