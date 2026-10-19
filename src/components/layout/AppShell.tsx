import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { DevConsole } from '../ui/DevConsole';
import { BrandLockup } from '../brand/BrandLockup';
import { BRAND_NAME } from '../../lib/brand';
import { PHONE_TABS, activePhoneTab, type PhoneTabId } from './appShellPhoneNav';
import {
  ClipboardList, LayoutTemplate, Settings, LogOut, Bell,
  User, X, Zap, ChevronDown, Users, BrainCircuit, RotateCw, Sparkles, FileText, MoreHorizontal,
  Calendar, Receipt, ShoppingCart, Package, Truck, FolderOpen,
  Briefcase, Wrench, Home, HardDrive, BookOpen, BarChart3, ScanLine, Link2, Building2, ListChecks, ShieldCheck, ShieldAlert, Wallet, Search, Shield, type LucideIcon,
} from 'lucide-react';
import { GlobalSearch } from '../search/GlobalSearch';
import { useCompanyAiKey } from '../../lib/useCompanyAiKey';
import { navItemAllowedForProfile } from '../../lib/templateAccess';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavGroup {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  items: { to: string; label: string; icon: LucideIcon }[];
}

const FIELD_GROUP: NavGroup = {
  label: 'Field Work',
  shortLabel: 'Field',
  icon: Wrench,
  items: [
    { to: '/inspections', label: 'Inspections', icon: ClipboardList },
    { to: '/jha', label: 'JHA documents', icon: ShieldCheck },
    { to: '/jha/take5', label: 'Take 5', icon: ShieldAlert },
    { to: '/templates', label: 'Templates', icon: LayoutTemplate },
    { to: '/jha/swms-library', label: 'SWMS library', icon: FileText },
    { to: '/drive', label: 'Shared Drive', icon: FolderOpen },
  ],
};

const OFFICE_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    shortLabel: 'Today',
    icon: Home,
    items: [
      { to: '/', label: 'Overview', icon: Zap },
      { to: '/reminders', label: 'Reminders', icon: Bell },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
      { to: '/reports-advanced', label: 'Reports & KPIs', icon: BarChart3 },
    ],
  },
  {
    label: 'CRM',
    shortLabel: 'Jobs',
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
    shortLabel: 'Money',
    icon: FileText,
    items: [
      { to: '/quotes', label: 'Quotes', icon: FileText },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/expenses', label: 'Expenses', icon: Wallet },
      { to: '/price-books', label: 'Price Books', icon: BookOpen },
    ],
  },
  {
    label: 'Inventory',
    shortLabel: 'Stock',
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

const PHONE_TAB_ICONS: Record<PhoneTabId, LucideIcon> = {
  today: Home,
  schedule: Calendar,
  jobs: Briefcase,
  more: MoreHorizontal,
};

/** Whisper chrome hooks — Take 5 matches JHA documents, not a second hero. */
function fieldWorkNavAttrs(to: string) {
  if (to === '/jha/take5') return { 'data-take5-nav': '' } as const;
  if (to === '/jha') return { 'data-jha-nav': '' } as const;
  return {};
}

export function AppShell({ children }: AppShellProps) {
  const { profile, company, signOut, isPlatformOperator } = useAuth();
  const { hasKey: companyAiKey } = useCompanyAiKey();
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

  const switcherName = (company?.name || profile?.name || 'User').trim() || 'User';
  const phoneTab = activePhoneTab(location.pathname, menuOpen);

  const visibleItems = (group: NavGroup) =>
    group.items.filter(item => navItemAllowedForProfile(item.to, profile));

  const renderGroupMenu = (group: NavGroup) => (
    visibleItems(group).map((item) => {
      const ItemIcon = item.icon;
      const itemActive = isNavItemActive(item, location.pathname, visibleItems(group));
      return (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => { setOpenGroup(null); setMenuOpen(false); }}
          className={menuItemClass(itemActive)}
          {...fieldWorkNavAttrs(item.to)}
        >
          <ItemIcon size={15} />
          {item.label}
        </Link>
      );
    })
  );

  return (
    <div className="shell-root flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      <header
        className="shell-header"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center shrink-0" onClick={handleLogoTap} aria-label={BRAND_NAME}>
            <BrandLockup size="header" />
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 justify-center h-14">
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
                    aria-label={group.label}
                    data-shell-nav-group={group.shortLabel}
                    className={`shell-nav-btn ${groupActive ? 'shell-nav-btn-active' : ''}`}
                  >
                    <Icon size={14} />
                    <span className="shell-nav-label-short">{group.shortLabel}</span>
                    <span className="shell-nav-label-full">{group.label}</span>
                    <ChevronDown size={11} className={`shell-nav-caret ${isOpen ? 'rotate-180' : ''}`} />
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

          <div className="hidden md:block w-11 shrink-0 xl:w-64 xl:min-w-0 xl:shrink">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="shell-search-btn flex items-center justify-center xl:justify-start gap-2 w-full h-11 min-h-11 min-w-0 rounded-lg px-1.5 xl:px-3 py-0 text-[13px] tracking-tight"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:block min-w-0 text-left">Search…</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="relative min-w-0">
              <button
                onClick={() => setAvatarOpen(!avatarOpen)}
                className="shell-switcher-btn hidden md:flex items-center gap-2 px-2 py-1.5 min-h-11 min-w-0 max-w-full"
                title={switcherName}
                aria-label={switcherName}
              >
                <div
                  data-shell-switcher-avatar
                  className="shell-switcher-avatar w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                >
                  {switcherName.charAt(0).toUpperCase()}
                </div>
                <span
                  data-shell-switcher-name
                  className="hidden md:line-clamp-2 w-fit max-w-[7.5rem] xl:max-w-[14rem] shrink-0 text-sm tracking-tight leading-4 break-words text-left"
                  title={switcherName}
                >
                  {switcherName}
                </span>
                <ChevronDown data-shell-switcher-chevron size={13} className="shell-nav-caret shrink-0" />
              </button>

              {avatarOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
                  <div className="shell-menu right-0 w-56">
                    <div className="shell-menu-head px-3 py-2.5">
                      <p className="text-sm font-medium tracking-tight">{profile?.name}</p>
                      <p className="shell-menu-meta text-xs truncate">{company?.name}</p>
                      {profile?.role && (
                        <span className="shell-menu-role inline-flex items-center mt-1.5 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide rounded-md">
                          {profile.role}
                        </span>
                      )}
                    </div>
                    <Link to="/settings/profile" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <User size={15} /> Profile
                    </Link>
                    <Link to="/settings/company" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <Settings size={15} /> Company Settings
                    </Link>
                    <Link to="/settings/lists" onClick={() => setAvatarOpen(false)}
                      className="shell-menu-item">
                      <ListChecks size={15} /> Managed Lists
                    </Link>
                    {isPlatformOperator && companyAiKey && (
                      <Link to="/assistant" onClick={() => setAvatarOpen(false)}
                        className="shell-menu-item">
                        <Sparkles size={15} /> AI Assistant
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                        <div className="shell-menu-rule my-1" />
                        <p className="shell-menu-kicker px-3 py-1 text-xs font-semibold uppercase tracking-wide">Admin</p>
                        <Link to="/settings/team" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Users size={15} /> Team
                        </Link>
                        <Link to="/settings/billing" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Wallet size={15} /> Billing
                        </Link>
                        <Link to="/settings/accounting" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Building2 size={15} /> Accounting
                        </Link>
                        {isPlatformOperator && (
                          <Link to="/settings/ai" onClick={() => setAvatarOpen(false)}
                            className="shell-menu-item">
                            <BrainCircuit size={15} /> AI Settings
                          </Link>
                        )}
                        {isPlatformOperator && companyAiKey && (
                          <Link to="/ai-console" onClick={() => setAvatarOpen(false)}
                            className="shell-menu-item">
                            <Sparkles size={15} /> AI Console
                          </Link>
                        )}
                      </>
                    )}
                    {isPlatformOperator && (
                      <>
                        <div className="shell-menu-rule my-1" />
                        <p className="shell-menu-kicker px-3 py-1 text-xs font-semibold uppercase tracking-wide">Platform</p>
                        <Link to="/operator" onClick={() => setAvatarOpen(false)}
                          className="shell-menu-item">
                          <Shield size={15} /> Operator
                        </Link>
                      </>
                    )}
                    <div className="shell-menu-rule my-1" />
                    <button onClick={handleSignOut}
                      className="shell-menu-item shell-menu-danger w-full text-left">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="shell-phone-menu md:hidden overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
              className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm w-full text-left"
            >
              <Search size={16} /> Search
            </button>
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(group, location.pathname);
              const isExpanded = openGroup === group.label;
              const Icon = group.icon;
              return (
                <div key={group.label} className="shell-phone-group">
                  <button
                    onClick={() => setOpenGroup(isExpanded ? null : group.label)}
                    className={`shell-phone-link w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium tracking-tight ${
                      groupActive ? 'is-active' : ''
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown size={14} className={`shell-nav-caret ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="pb-1">
                      {visibleItems(group).map((item) => {
                        const ItemIcon = item.icon;
                        const itemActive = isNavItemActive(item, location.pathname, visibleItems(group));
                        return (
                          <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                            className={`shell-phone-link flex items-center gap-2.5 pl-11 pr-4 py-2.5 text-sm tracking-tight ${
                              itemActive ? 'is-active font-medium' : ''
                            }`}
                            {...fieldWorkNavAttrs(item.to)}>
                            <ItemIcon size={15} /> {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="shell-menu-rule" />
            <p className="shell-menu-kicker px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">Settings</p>
            <Link to="/settings/profile" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
              <User size={16} /> Profile
            </Link>
            <Link to="/settings/company" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
              <Settings size={16} /> Company Settings
            </Link>
            <Link to="/settings/lists" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
              <ListChecks size={16} /> Managed Lists
            </Link>
            {isPlatformOperator && companyAiKey && (
              <Link to="/assistant" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                <Sparkles size={16} /> AI Assistant
              </Link>
            )}
            {isAdmin && (
              <>
                <Link to="/settings/team" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                  <Users size={16} /> Team
                </Link>
                <Link to="/settings/billing" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                  <Wallet size={16} /> Billing
                </Link>
                <Link to="/settings/accounting" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                  <Building2 size={16} /> Accounting
                </Link>
                {isPlatformOperator && (
                  <Link to="/settings/ai" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                    <BrainCircuit size={16} /> AI Settings
                  </Link>
                )}
                {isPlatformOperator && companyAiKey && (
                  <Link to="/ai-console" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm font-medium">
                    <Sparkles size={16} /> AI Console
                  </Link>
                )}
              </>
            )}
            {isPlatformOperator && (
              <Link to="/operator" onClick={() => setMenuOpen(false)} className="shell-phone-link flex items-center gap-2.5 px-4 py-3 text-sm">
                <Shield size={16} /> Operator
              </Link>
            )}
            <button onClick={handleSignOut} className="shell-phone-link shell-menu-danger flex items-center gap-2.5 px-4 py-3 text-sm w-full">
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

      <nav
        className="shell-bottom-nav md:hidden"
        aria-label="Phone navigation"
      >
        {PHONE_TABS.map((tab) => {
          const active = phoneTab === tab.id;
          const className = `shell-bottom-tab ${active ? 'shell-bottom-tab-active' : ''}`;
          if (tab.to === null) {
            const MoreIcon = menuOpen ? X : PHONE_TAB_ICONS.more;
            return (
              <button
                key={tab.id}
                type="button"
                data-phone-tab={tab.id}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                className={className}
              >
                <span className="shell-bottom-tab-pip"><MoreIcon size={20} /></span>
                <span>{tab.label}</span>
              </button>
            );
          }
          const TabIcon = PHONE_TAB_ICONS[tab.id];
          return (
            <Link
              key={tab.id}
              to={tab.to}
              data-phone-tab={tab.id}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={className}
            >
              <span className="shell-bottom-tab-pip"><TabIcon size={20} /></span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

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
