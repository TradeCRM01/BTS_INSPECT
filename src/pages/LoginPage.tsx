import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { BrandLockup } from '../components/brand/BrandLockup';


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
    <div className="min-h-screen auth-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <BrandLockup size="auth" tagline="Inspection & field service management" />

        <div className="bg-white border border-white/20 p-6">
          <h1 className="text-lg font-semibold text-[#1A1A1A] mb-1">Sign in</h1>
          <p className="text-sm text-[#4A5568] mb-6">Welcome back. Enter your credentials to continue.</p>

          {expired && (
            <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2.5 rounded-md text-sm">
              That email link expired or was already used. Sign in below, or use Forgot password / ask for a new invite.
            </div>
          )}
          {recovered && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2.5 rounded-md text-sm">
              App cache cleared. You can sign in again.
            </div>
          )}

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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-[#1A1A1A]">Password</label>
                <Link to="/forgot-password" className="text-xs text-[#2E75B6] hover:underline">
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
                  className="w-full px-3 py-2.5 pr-10 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
                  placeholder="••••••••"
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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/60 mt-4">
          Invited to a team? Use the link in your invite email to set a password, or{' '}
          <Link to="/forgot-password" className="text-[#2E75B6] font-medium hover:underline">
            reset password
          </Link>
          .
        </p>
        <p className="text-center text-sm text-white/60 mt-2">
          Page won’t load?{' '}
          <a href="/login?clear=1" className="text-[#2E75B6] font-medium hover:underline">
            Clear cache &amp; retry
          </a>
        </p>
      </div>
    </div>
  );
}
