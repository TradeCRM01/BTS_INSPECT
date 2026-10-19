import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BrandLockup } from '../brand/BrandLockup';
import { BRAND_NAME } from '../../lib/brand';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, CreditCard, LayoutDashboard, LogOut, ScrollText, ArrowLeft, UserCog } from 'lucide-react';

const NAV = [
  { to: '/operator', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/operator/companies', label: 'Companies', icon: Building2, end: false },
  { to: '/operator/billing', label: 'Billing', icon: CreditCard, end: false },
  { to: '/operator/audit', label: 'Audit', icon: ScrollText, end: false },
  { to: '/operator/operators', label: 'Developers', icon: UserCog, end: false },
] as const;

export function OperatorShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--g-bg)', color: 'var(--g-ink)' }}>
      <header className="shell-header shrink-0">
        <div className="max-w-6xl mx-auto px-4 min-h-[52px] flex items-center gap-2 sm:gap-4">
          <Link to="/operator" className="shrink-0" aria-label={`${BRAND_NAME} operator`}>
            <BrandLockup size="header" />
          </Link>
          <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--g-ink-subtle)' }}>
            Operator
          </span>
          <nav className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto" aria-label="Operator">
            {NAV.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 min-h-[44px] text-sm tracking-tight whitespace-nowrap ${
                      isActive ? 'shell-nav-btn-active font-medium' : 'shell-ops-nav-idle'
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
              className="hidden sm:flex items-center gap-1.5 px-3 min-h-[44px] text-sm"
              style={{ color: 'var(--g-ink-muted)' }}
            >
              <ArrowLeft size={14} /> App
            </button>
            <span className="hidden md:inline text-xs truncate max-w-[140px]" style={{ color: 'var(--g-ink-subtle)' }}>
              {profile?.email}
            </span>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="flex items-center gap-1.5 px-2 sm:px-3 min-h-[44px] text-sm shell-menu-danger"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
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
