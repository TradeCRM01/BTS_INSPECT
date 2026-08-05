import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Bitcoin, Eye, EyeOff } from 'lucide-react';

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate inputs
      if (!name.trim()) throw new Error('Your name is required');
      if (!email.trim()) throw new Error('Email is required');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');

      // Clear any stale session before creating a new account
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore — session may already be invalid
      }
      // Force-remove any lingering session from localStorage
      try {
        const keys = Object.keys(localStorage).filter(k =>
          k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        keys.forEach(k => localStorage.removeItem(k));
      } catch {
        // localStorage may be unavailable
      }

      // Call signup edge function with service role privileges
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-user`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email,
          password,
          name,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Sign up failed');
      }

      // Sign in directly on the client — avoids setSession token refresh issues
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(`Account created, but sign-in failed: ${signInError.message}`);
      }

      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      setLoading(false);
    }
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
          <h1 className="text-lg font-semibold text-[#1A1A1A] mb-1">Create account</h1>
          <p className="text-sm text-[#4A5568] mb-6">Join BTS Inspect and start creating inspections.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Your name</label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
                placeholder="Jane Smith"
              />
            </div>

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
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2.5 pr-10 border border-[#E5E7EB] rounded-md text-[#1A1A1A] placeholder:text-[#4A5568]/50 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent transition-shadow"
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
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/60 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-[#F7931A] font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
