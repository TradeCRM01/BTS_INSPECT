import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Users, AlertTriangle, CalendarX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { todayCommandStats } from '../../lib/todayCommand';

export function TodayCommandBar() {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ['today-command', profile?.company_id],
    queryFn: async () => {
      const [{ data: jobs, error: jobErr }, { data: invoices, error: invErr }] = await Promise.all([
        supabase
          .from('jobs')
          .select('status, scheduled_date, assigned_team')
          .in('status', ['scheduled', 'in_progress', 'completed', 'cancelled']),
        supabase
          .from('invoices')
          .select('status, due_date')
          .in('status', ['sent', 'overdue']),
      ]);
      if (jobErr) throw jobErr;
      if (invErr) throw invErr;
      return todayCommandStats(jobs ?? [], invoices ?? []);
    },
    enabled: !!profile,
  });

  const stats = data ?? { todayOpen: 0, unassignedDated: 0, needsDate: 0, overdueInvoices: 0 };

  const tiles = [
    { label: 'On today', value: stats.todayOpen, href: '/schedule', icon: Calendar },
    { label: 'Unassigned', value: stats.unassignedDated, href: '/schedule', icon: Users },
    { label: 'Needs a date', value: stats.needsDate, href: '/jobs', icon: CalendarX },
    { label: 'Overdue invoices', value: stats.overdueInvoices, href: '/invoices?status=overdue', icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
      {tiles.map(tile => {
        const Icon = tile.icon;
        return (
          <Link
            key={tile.label}
            to={tile.href}
            className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 hover:border-[#2E75B6] transition-colors min-h-[52px]"
          >
            <Icon size={16} className="text-[#2E75B6] shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-bold text-[#0A2540] leading-none">{tile.value}</p>
              <p className="text-xs text-[#4A5568] truncate">{tile.label}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
