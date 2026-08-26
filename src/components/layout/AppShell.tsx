import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { DevConsole } from '../ui/DevConsole';
import { BrandLockup } from '../brand/BrandLockup';
import { resolveAppShellColors } from './appShellTheme';
import {
  ClipboardList, LayoutTemplate, Settings, LogOut,
  User, Menu, X, Zap, ChevronDown, Users, BrainCircuit, RotateCw, Sparkles, FileText,
  Calendar, Receipt, ShoppingCart, Package, Truck, FolderOpen,
  Briefcase, Wrench, Home, HardDrive, BookOpen, Clock, BarChart3, ScanLine, Link2, Building2, ListChecks, ShieldCheck, Wallet, Sun, Search, Shield, type LucideIcon,
} from 'lucide-react';
import { GlobalSearch } from '../search/GlobalSearch';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: { to: string; label: string; icon: LucideIcon }[];
}

const FIELD_GROUP: NavGroup = {
  label: 'Field Work',
  icon: Wrench,
  items: [
    { to: '/inspections', label: 'Inspections', icon: ClipboardList },
    { to: '/jha', label: 'JHA documents', icon: ShieldCheck },
    { to: '/templates', label: 'Templates', icon: LayoutTemplate },
    { to: '/jha/swms-library', label: 'SWMS library', icon: FileText },
    { to: '/drive', label: 'Shared Drive', icon: FolderOpen },
  ],
};

const OFFICE_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    icon: Home,
    items: [
      { to: '/', label: 'Overview', icon: Zap },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
      { to: '/reports-advanced', label: 'Reports & KPIs', icon: BarChart3 },
    ],
  },
  {
    label: 'CRM',
    icon: Briefcase,
    items: [
      { to: '/jobs', label: 'Jobs', icon: Briefcase },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/assets', label: 'Assets', icon: HardDrive },
      { to: '/contracts', label: 'Service Contracts', icon: FileText },
      { to: '/compliance', label: 'Compliance', icon: ShieldCheck },
      { to: '/portal', label: 'Customer Portal', icon: Link2 },
    ],
  },
  {
    label: 'Financials',
    icon: FileText,
    items: [
      { to: '/quotes', label: 'Quotes', icon: FileText },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/expenses', label: 'Expenses', icon: Wallet },
      { to: '/solar-estimates', label: 'Solar estimates', icon: Sun },
      { to: '/price-books', label: 'Price Books', icon: BookOpen },
      { to: '/timesheets', label: 'Timesheets', icon: Clock },
    ],
  },
  {
    label: 'Inventory',
    icon: Package,
    items: [
      { to: '/stock', label: 'Stock', icon: Package },
      { to: '/suppliers', label: 'Suppliers', icon: Truck },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
      { to: '/barcode', label: 'Barcode Scanner', icon: ScanLine },
    ],
  },
];

const NAV_GROUPS: NavGroup[] = [
  OFFICE_GROUPS[0], // Dashboard
  OFFICE_GROUPS[1], // CRM
  FIELD_GROUP,
  OFFICE_GROUPS[2], // Financials
  OFFICE_GROUPS[3], // Inventory
];

function isNavItemActive(item: { to: string }, pathname: string, allItems?: { to: string }[]): boolean {
  if (item.to === '/') return pathname === '/';
  if (item.to === '/drive') {
    return pathname === '/drive' || pathname.startsWith('/drive') || (pathname.startsWith('/reports') && !pathname.startsWith('/reports-advanced'));
  }
  if (item.to === '/reports-advanced') return pathname.startsWith('/reports-advanced');
  if (!pathname.startsWith(item.to)) return false;
  // Prefer the longest matching prefix when siblings share a path (e.g. /jha vs /jha/swms-library)
  if (allItems?.length) {
    const longerMatch = allItems.some(
      other =>
        other.to !== item.to &&
        other.to.startsWith(item.to) &&
        pathname.startsWith(other.to),
    );
    if (longerMatch) return false;
  }
  return true;
}

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => isNavItemActive(item, pathname, group.items));
}

function menuItemClass(active: boolean) {
  return `shell-menu-item ${active ? 'shell-menu-item-active' : ''}`;
}

export function AppShell({ children }: AppShellProps) {
  const { profile, company, signOut, isPlatformOperator } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const touchStartY = useRef(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const logoTapCountRef = useRef(0);
  const logoTapTimerRef = useRef<NodeJS.Timeout>();
  const groupCloseTimer = useRef<NodeJS.Timeout>();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries();
      setTimeout(() => {
        setPullDistance(0);
        setIsRefreshing(false);
      }, 500);
    } catch (error) {
      console.error('Refresh failed:', error);
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const handleLogoTap = () => {
    logoTapCountRef.current++;
    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      clearTimeout(logoTapTimerRef.current);
      setShowDevConsole(true);
      return;
    }
    clearTimeout(logoTapTimerRef.current);
    logoTapTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0;
    }, 1500);
  };

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const el = mainRef.current;
      if (!isRefreshing && el && el.scrollTop === 0 && e.touches.length > 0) {
        touchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const el = mainRef.current;
      if (!isRefreshing && el && el.scrollTop === 0 && touchStartY.current > 0 && e.touches.length > 0) {
        const distance = e.touches[0].clientY - touchStartY.current;
        if (distance > 0) {
          e.preventDefault?.();
          setPullDistance(Math.min(distance, 120));
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance > 80) {
        handleRefresh();
      } else {
        setPullDistance(0);
      }
      touchStartY.current = 0;
    };

    const el = mainRef.current;
    if (el) {
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd);
      return () => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [pullDistance, isRefreshing, handleRefresh]);

  // Close dropdowns on route change
  useEffect(() => {
    setOpenGroup(null);
    setAvatarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const handleGroupEnter = (label: string) => {
    clearTimeout(groupCloseTimer.current);
    setOpenGroup(label);
  };

  const handleGroupLeave = () => {
    groupCloseTimer.current = setTimeout(() => setOpenGroup(null), 150);
  };

  const chrome = resolveAppShellColors(
    (company as { report_theme?: unknown } | null)?.report_theme ?? null,
  );

  const renderGroupMenu = (group: NavGroup) => (
    group.items.map((item) => {
      const ItemIcon = item.icon;
      const itemActive = isNavItemActive(item, location.pathname, group.items);
      return (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => { setOpenGroup(null); setMenuOpen(false); }}
          className={menuItemClass(itemActive)}
        >
          <ItemIcon size={15} className={itemActive ? 'text-white' : 'text-white/45'} />
          {item.label}
        </Link>
      );
    })
  );

  return (
    <div className="bg-zebra flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      <header
        className="shell-header"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          '--shell-navy': chrome.navy,
          '--shell-accent': chrome.accent,
        } as CSSProperties}
      >
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center shrink-0" onClick={handleLogoTap} aria-label="Grafter">
            <BrandLockup size="header" />
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center h-14">
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(group, location.pathname);
              const isOpen = openGroup === group.label;
              const Icon = group.icon;
              return (
                <div
                  key={group.label}
                  className="relative h-full flex items-center"
                  onMouseEnter={() => handleGroupEnter(group.label)}
                  onMouseLeave={handleGroupLeave}
                >
                  <button
                    onClick={() => {
                      if (isOpen) {
                        setOpenGroup(null);
                      } else {
                        setOpenGroup(group.label);
                      }
                    }}
                  className={`flex items-center gap-1.5 h-full px-3 text-sm font-medium tracking-tight border-b-2 transition-colors ${
                      groupActive
                        ? 'text-white border-accent'
                        : 'text-white/65 border-transparent hover:text-white hover:border-white/25'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{group.label}</span>
                    <ChevronDown size={11} className={`text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
                      <div className="shell-menu left-0">
                        {renderGroupMenu(group)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="hidden md:block w-48 lg:w-64 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[13px] tracking-tight text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left hidden sm:inline">Search…</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
              <button
                onClick={() => setAvatarOpen(!avatarOpen)}
                className="hidden md:flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-semibold">
                  {profile?.name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <span className="text-sm tracking-tight text-white/80 max-w-[120px] truncate">{profile?.name ?? 'User'}</span>
                <ChevronDown size={13} className="text-white/45" />
              </button>

              {avatarOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
                  <div className="shell-menu right-0 w-56">
                    <div className="px-3 py-2.5 border-b border-white/10">
                      <p className="text-sm font-medium text-white tracking-tight">{profile?.name}</p>
                      <p className="text-xs text-white/45 truncate">{company?.name}</p>
                      {profile?.role && (
                        <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white/70 border border-white/15 rounded-md">
                          {profile.role}
                        </span>
                      )}
                    </div>
                    <Link to="/settings/profile" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <User size={15} className="text-white/45" /> Profile
                    </Link>
                    <Link to="/settings/company" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <Settings size={15} className="text-white/45" /> Company Settings
                    </Link>
                    <Link to="/settings/lists" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <ListChecks size={15} className="text-white/45" /> Managed Lists
                    </Link>
                    <Link to="/assistant" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <Sparkles size={15} className="text-white/45" /> AI Assistant
                    </Link>
                    {isAdmin && (
                      <>
                        <div className="border-t border-white/10 my-1" />
                        <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/35">Admin</p>
                        <Link to="/settings/team" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Users size={15} className="text-white/45" /> Team
                        </Link>
                        <Link to="/settings/accounting" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Building2 size={15} className="text-white/45" /> Accounting
                        </Link>
                        <Link to="/settings/ai" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <BrainCircuit size={15} className="text-white/45" /> AI Settings
                        </Link>
                        <Link to="/ai-console" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Sparkles size={15} className="text-white/45" /> AI Console
                        </Link>
                      </>
                    )}
                    {isPlatformOperator && (
                      <>
                        <div className="border-t border-white/10 my-1" />
                        <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/35">Platform</p>
                        <Link to="/operator" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Shield size={15} className="text-white/45" /> Operator
                        </Link>
                      </>
                    )}
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={handleSignOut}
                      className="shell-menu-item text-[#FCA5A5] hover:text-white w-full text-left">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>

            <button className="md:hidden p-2 hover:bg-white/5" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-navy max-h-[calc(100vh-4rem)] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70 w-full text-left"
            >
              <Search size={16} /> Search
            </button>
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(group, location.pathname);
              const isExpanded = openGroup === group.label;
              const Icon = group.icon;
              return (
                <div key={group.label} className="border-t border-white/10">
                  <button
                    onClick={() => setOpenGroup(isExpanded ? null : group.label)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium tracking-tight ${
                      groupActive ? 'text-white' : 'text-white/70'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown size={14} className={`text-white/35 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="pb-1">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const itemActive = isNavItemActive(item, location.pathname, group.items);
                        return (
                          <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                            className={`flex items-center gap-2.5 pl-11 pr-4 py-2.5 text-sm tracking-tight ${
                              itemActive ? 'text-white font-medium' : 'text-white/55'
                            }`}>
                            <ItemIcon size={15} /> {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="border-t border-white/10" />
            <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/35">Settings</p>
            <Link to="/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <User size={16} /> Profile
            </Link>
            <Link to="/settings/company" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <Settings size={16} /> Company Settings
            </Link>
            <Link to="/settings/lists" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <ListChecks size={16} /> Managed Lists
            </Link>
            <Link to="/assistant" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <Sparkles size={16} /> AI Assistant
            </Link>
            {isAdmin && (
              <>
                <Link to="/settings/team" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
                  <Users size={16} /> Team
                </Link>
                <Link to="/settings/accounting" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
                  <Building2 size={16} /> Accounting
                </Link>
                <Link to="/settings/ai" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
                  <BrainCircuit size={16} /> AI Settings
                </Link>
                <Link to="/ai-console" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/80 font-medium">
                  <Sparkles size={16} /> AI Console
                </Link>
              </>
            )}
            {isPlatformOperator && (
              <Link to="/operator" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
                <Shield size={16} /> Operator
              </Link>
            )}
            <button onClick={handleSignOut} className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#FCA5A5] w-full">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden relative w-full" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', msOverflowStyle: 'auto', scrollbarWidth: 'auto' }}>
        {(pullDistance > 0 || isRefreshing) && (
          <div className="fixed top-0 left-0 right-0 flex justify-center pt-4 z-20 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <div style={{ opacity: Math.min(pullDistance / 80, 1) }}>
                <RotateCw
                  size={24}
                  className={`${isRefreshing ? 'animate-spin' : ''} text-accent`}
                  style={{ animationDuration: isRefreshing ? '0.8s' : undefined }}
                />
              </div>
              <p className="ops-meta font-medium" style={{ opacity: Math.min(pullDistance / 80, 1) }}>
                {isRefreshing ? 'Refreshing...' : pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh'}
              </p>
            </div>
          </div>
        )}
        <div
          className="animate-fade-in"
          style={
            pullDistance > 0
              ? { transform: `translateY(${pullDistance * 0.5}px)`, transition: 'none' }
              : { transition: 'transform 0.3s ease-out' }
          }
        >
          {children}
        </div>
      </main>

      {showDevConsole && (
        <DevConsole
          onRefetchQueries={async () => { await queryClient.refetchQueries(); }}
          onClose={() => setShowDevConsole(false)}
        />
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
