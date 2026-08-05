import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { DevConsole } from '../ui/DevConsole';
import {
  ClipboardList, LayoutTemplate, Settings, LogOut,
  User, Menu, X, Zap, Bitcoin, ChevronDown, Users, BrainCircuit, RotateCw, Sparkles, FileText,
  Calendar, Receipt, ShoppingCart, Package, Truck, FolderOpen,
  Briefcase, Wrench, Home, HardDrive, BookOpen, Clock, BarChart3, ScanLine, Link2, Building2, ListChecks, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { GlobalSearchTrigger } from '../search/GlobalSearch';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: { to: string; label: string; icon: LucideIcon }[];
}

const NAV_GROUPS: NavGroup[] = [
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
  {
    label: 'Field Work',
    icon: Wrench,
    items: [
      { to: '/templates', label: 'Templates', icon: LayoutTemplate },
      { to: '/inspections', label: 'Inspections', icon: ClipboardList },
      { to: '/drive', label: 'Shared Drive', icon: FolderOpen },
    ],
  },
];

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => {
    if (item.to === '/') return pathname === '/';
    if (item.to === '/drive') return pathname === '/drive' || pathname.startsWith('/drive') || (pathname.startsWith('/reports') && !pathname.startsWith('/reports-advanced'));
    if (item.to === '/reports-advanced') return pathname.startsWith('/reports-advanced');
    return pathname.startsWith(item.to);
  });
}

function getActiveItemLabel(group: NavGroup, pathname: string): string | null {
  for (const item of group.items) {
    if (item.to === '/' && pathname === '/') return item.label;
    if (item.to === '/drive' && (pathname === '/drive' || pathname.startsWith('/drive') || (pathname.startsWith('/reports') && !pathname.startsWith('/reports-advanced')))) return item.label;
    if (item.to === '/reports-advanced' && pathname.startsWith('/reports-advanced')) return item.label;
    if (item.to !== '/' && item.to !== '/drive' && item.to !== '/reports-advanced' && pathname.startsWith(item.to)) return item.label;
  }
  return null;
}

export function AppShell({ children }: AppShellProps) {
  const { profile, company, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    <div className="bg-[#F9FAFB] flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="bg-gradient-to-b from-[#0A2540] to-[#082036] text-white sticky top-0 z-40 flex-shrink-0 safe-area-inset-top border-b border-white/5" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo — tap 5x to open dev console */}
          <Link to="/" className="flex items-center gap-2 shrink-0" onClick={handleLogoTap}>
            <div className="w-8 h-8 bg-gradient-to-br from-[#F7931A] to-[#E67E0E] rounded-lg flex items-center justify-center shadow-sm">
              <Bitcoin size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm tracking-wide hidden sm:inline">BTS Inspect</span>
          </Link>

          {/* Desktop nav — grouped dropdowns */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(group, location.pathname);
              const activeLabel = getActiveItemLabel(group, location.pathname);
              const isOpen = openGroup === group.label;
              const Icon = group.icon;
              return (
                <div
                  key={group.label}
                  className="relative"
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{activeLabel || group.label}</span>
                    <ChevronDown size={12} className={`text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
                      <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-white rounded-lg shadow-xl border border-[#E5E7EB] z-50 py-1.5 animate-fade-in">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const itemActive = (() => {
                            if (item.to === '/') return location.pathname === '/';
                            if (item.to === '/drive') return location.pathname === '/drive' || location.pathname.startsWith('/drive') || (location.pathname.startsWith('/reports') && !location.pathname.startsWith('/reports-advanced'));
                            if (item.to === '/reports-advanced') return location.pathname.startsWith('/reports-advanced');
                            return location.pathname.startsWith(item.to);
                          })();
                          return (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setOpenGroup(null)}
                              className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                                itemActive
                                  ? 'bg-[#F0F7FF] text-[#0A2540] font-medium'
                                  : 'text-[#1A1A1A] hover:bg-[#F9FAFB]'
                              }`}
                            >
                              <ItemIcon size={15} className={itemActive ? 'text-[#2E75B6]' : 'text-[#6B7280]'} />
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Global Search Trigger */}
          <div className="hidden md:block w-48 lg:w-64 shrink-0">
            <GlobalSearchTrigger />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Avatar dropdown */}
            <div className="relative">
              <button
                onClick={() => setAvatarOpen(!avatarOpen)}
                className="hidden md:flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#2E75B6] flex items-center justify-center text-xs font-semibold">
                  {profile?.name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <span className="text-sm text-white/80 max-w-[120px] truncate">{profile?.name ?? 'User'}</span>
                <ChevronDown size={13} className="text-white/60" />
              </button>

              {avatarOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-[#E5E7EB] z-50 py-1.5 animate-fade-in">
                    <div className="px-3 py-2.5 border-b border-[#E5E7EB]">
                      <p className="text-sm font-medium text-[#1A1A1A]">{profile?.name}</p>
                      <p className="text-xs text-[#4A5568] truncate">{company?.name}</p>
                      {profile?.role && (
                        <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-[#0A2540]/10 text-[#0A2540]">
                          {profile.role}
                        </span>
                      )}
                    </div>
                    <Link to="/settings/profile" onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                      <User size={15} className="text-[#6B7280]" /> Profile
                    </Link>
                    <Link to="/settings/company" onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                      <Settings size={15} className="text-[#6B7280]" /> Company Settings
                    </Link>
                    <Link to="/settings/lists" onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                      <ListChecks size={15} className="text-[#6B7280]" /> Managed Lists
                    </Link>
                    {isAdmin && (
                      <Link to="/settings/team" onClick={() => setAvatarOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                        <Users size={15} className="text-[#6B7280]" /> Team
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                        <div className="border-t border-[#E5E7EB] my-1" />
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Admin</p>
                        <Link to="/settings/accounting" onClick={() => setAvatarOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                          <Building2 size={15} className="text-[#6B7280]" /> Accounting
                        </Link>
                        <Link to="/settings/ai" onClick={() => setAvatarOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F9FAFB]">
                          <BrainCircuit size={15} className="text-[#6B7280]" /> AI Settings
                        </Link>
                        <Link to="/ai-console" onClick={() => setAvatarOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#92400E] hover:bg-[#FFFBEB] font-medium">
                          <Sparkles size={15} className="text-[#D97706]" /> AI Console
                        </Link>
                      </>
                    )}
                    <div className="border-t border-[#E5E7EB] my-1" />
                    <button onClick={handleSignOut}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#B42318] hover:bg-[#FEF2F2] w-full text-left">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Mobile menu toggle */}
            <button className="md:hidden p-2 rounded hover:bg-white/10" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav — collapsible groups */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0A2540] max-h-[calc(100vh-3.5rem)] overflow-y-auto animate-slide-up">
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(group, location.pathname);
              const isExpanded = openGroup === group.label;
              const Icon = group.icon;
              return (
                <div key={group.label} className="border-b border-white/5">
                  <button
                    onClick={() => setOpenGroup(isExpanded ? null : group.label)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium ${
                      groupActive ? 'text-white' : 'text-white/70'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown size={14} className={`text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="pb-2 bg-black/10">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const itemActive = (() => {
                          if (item.to === '/') return location.pathname === '/';
                          if (item.to === '/drive') return location.pathname === '/drive' || location.pathname.startsWith('/drive') || (location.pathname.startsWith('/reports') && !location.pathname.startsWith('/reports-advanced'));
                          if (item.to === '/reports-advanced') return location.pathname.startsWith('/reports-advanced');
                          return location.pathname.startsWith(item.to);
                        })();
                        return (
                          <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                            className={`flex items-center gap-2.5 pl-11 pr-4 py-2.5 text-sm ${
                              itemActive ? 'text-white font-medium' : 'text-white/60'
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
            <hr className="border-white/10" />
            <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/30">Settings</p>
            <Link to="/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <User size={16} /> Profile
            </Link>
            <Link to="/settings/company" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <Settings size={16} /> Company Settings
            </Link>
            <Link to="/settings/lists" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70">
              <ListChecks size={16} /> Managed Lists
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
                <Link to="/ai-console" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#FCD34D] font-medium">
                  <Sparkles size={16} /> AI Console
                </Link>
              </>
            )}
            <button onClick={handleSignOut} className="flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 w-full">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden relative w-full" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', msOverflowStyle: 'auto', scrollbarWidth: 'auto' }}>
        {(pullDistance > 0 || isRefreshing) && (
          <div className="fixed top-0 left-0 right-0 flex justify-center pt-4 z-20 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <div style={{ opacity: Math.min(pullDistance / 80, 1) }}>
                <RotateCw
                  size={24}
                  className={`${isRefreshing ? 'animate-spin' : ''} text-[#2E75B6]`}
                  style={{ animationDuration: isRefreshing ? '0.8s' : undefined }}
                />
              </div>
              <p className="text-xs text-[#4A5568] font-medium" style={{ opacity: Math.min(pullDistance / 80, 1) }}>
                {isRefreshing ? 'Refreshing...' : pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh'}
              </p>
            </div>
          </div>
        )}
        <div className="animate-fade-in" style={{ transform: `translateY(${pullDistance * 0.5}px)`, transition: pullDistance === 0 ? 'transform 0.3s ease-out' : 'none' }}>
          {children}
        </div>
      </main>

      {showDevConsole && (
        <DevConsole
          onRefetchQueries={async () => { await queryClient.refetchQueries(); }}
          onClose={() => setShowDevConsole(false)}
        />
      )}
    </div>
  );
}
