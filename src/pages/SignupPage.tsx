import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
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
      if (!name.trim()) throw new Error('Your name is required');
      if (!companyName.trim()) throw new Error('Company name is required');
      if (!email.trim()) throw new Error('Email is required');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');

      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore — session may already be invalid
      }
      try {
        const keys = Object.keys(localStorage).filter(k =>
          k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        keys.forEach(k => localStorage.removeItem(k));
      } catch {
        // localStorage may be unavailable
      }

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
          company_name: companyName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Sign up failed');
      }

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
    <AuthShell
      title="Create a workspace"
      lede="Your business gets its own Grafter workspace."
      footer={(
        <p>
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">Your name</label>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="form-input"
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label className="form-label">Company / business name</label>
          <input
            type="text"
            autoComplete="organization"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            required
            className="form-input"
            placeholder="Northside Electrics"
          />
        </div>

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
          <label className="form-label">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="hub-auth-submit">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
