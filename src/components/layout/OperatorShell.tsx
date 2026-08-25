import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BrandLockup } from '../brand/BrandLockup';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, CreditCard, LayoutDashboard, LogOut, ScrollText, ArrowLeft } from 'lucide-react';

const NAV = [
  { to: '/operator', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/operator/companies', label: 'Companies', icon: Building2, end: false },
  { to: '/operator/billing', label: 'Billing', icon: CreditCard, end: false },
  { to: '/operator/audit', label: 'Audit', icon: ScrollText, end: false },
] as const;

export function OperatorShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F8]">
      <header className="bg-[#0A2540] text-white shrink-0">
        <div className="max-w-6xl mx-auto px-4 min-h-[52px] flex items-center gap-4">
          <Link to="/operator" className="shrink-0" aria-label="Grafter operator">
            <BrandLockup size="header" />
          </Link>
          <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wide text-white/45">
            Operator
          </span>
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto" aria-label="Operator">
            {NAV.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 min-h-[44px] text-sm tracking-tight whitespace-nowrap ${
                      isActive ? 'text-white font-medium bg-white/10' : 'text-white/70 hover:text-white'
                    }`
                  }
                >
                  <Icon size={14} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hidden sm:flex items-center gap-1.5 px-3 min-h-[44px] text-sm text-white/70 hover:text-white"
            >
              <ArrowLeft size={14} /> App
            </button>
            <span className="hidden md:inline text-xs text-white/45 truncate max-w-[140px]">
              {profile?.email}
            </span>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="flex items-center gap-1.5 px-3 min-h-[44px] text-sm text-[#FCA5A5]"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
