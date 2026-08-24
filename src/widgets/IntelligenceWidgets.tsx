import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, formatDistanceToNow, isPast, isWithinInterval, addDays, subDays } from 'date-fns';
import {
  Bot, Send, User, Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  Clock, Activity, Shield, Newspaper, Zap, ArrowUpRight, ArrowDownRight,
  CheckCircle, Calendar, Users, Briefcase, FileText, DollarSign,
  Loader2, Wrench, AlertCircle,
} from 'lucide-react';
import type { WidgetProps } from './WidgetComponents';

// ────────────────────────────────────────────────────────────────────────────
// AI Agent Widget — your on-dashboard assistant that can take real actions
// ────────────────────────────────────────────────────────────────────────────

interface AgentMessage { role: 'user' | 'assistant'; content: string; }

const AGENT_SUGGESTIONS = [
  'What needs my attention today?',
  'Create a reminder to follow up on overdue invoices',
  'Which jobs are at risk of running late?',
  'Summarise my cash flow this week',
  'Search the web for current electrical safety regulations',
  'Create a high priority job for tomorrow morning',
];

export function AiAgentWidget({}: WidgetProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    const next: AgentMessage[] = [...messages, { role: 'user', content: msg }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`${EDGE}/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, sessionId: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? 'Request failed');
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assistantText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const data = JSON.parse(raw);
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              assistantText += data.delta.text;
              setMessages(m => {
                const u = [...m];
                u[u.length - 1] = { role: 'assistant', content: assistantText };
                return u;
              });
            }
          } catch { /* ignore */ }
        }
      }
      queryClient.invalidateQueries();
    } catch (err) {
      setMessages(m => {
        const u = m.slice(0, -1);
        u.push({ role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong.' });
        return u;
      });
    } finally { setBusy(false); }
  }, [input, busy, messages, session, queryClient]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#0A2540] to-[#2E75B6] flex items-center justify-center">
            <Bot size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-[#1A1A1A]">AI Agent</span>
          <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
          </span>
        </div>
        <button onClick={() => navigate('/ai-assistant')}
          className="text-[10px] text-[#2E75B6] hover:underline">Expand</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 -mx-1 px-1 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] flex items-center justify-center mb-2">
              <Sparkles size={16} className="text-[#2E75B6]" />
            </div>
            <p className="text-[11px] text-[#4A5568] mb-2">Ask me to take action, check on work, or create reminders.</p>
            <div className="space-y-1 w-full">
              {AGENT_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-[#F9FAFB] hover:bg-[#EFF6FF] border border-[#E5E7EB] hover:border-[#2E75B6] text-[10px] text-[#4A5568] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-[#0A2540]' : 'bg-[#2E75B6]'}`}>
              {m.role === 'user' ? <User size={10} className="text-white" /> : <Bot size={10} className="text-white" />}
            </div>
            <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words ${
              m.role === 'user'
                ? 'bg-[#0A2540] text-white'
                : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#1A1A1A]'
            }`}>
              {m.content || (busy ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 mt-1.5 flex gap-1.5 items-end">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={busy}
          placeholder="Ask the agent…"
          className="flex-1 min-w-0 min-h-[44px] text-[11px] border border-[#E5E7EB] rounded-lg px-2 py-2 outline-none focus:border-[#2E75B6] disabled:opacity-50"
        />
        <button onClick={() => send()} disabled={!input.trim() || busy}
          className="w-7 h-7 rounded-lg bg-[#0A2540] text-white flex items-center justify-center disabled:opacity-40 shrink-0">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Industry News Widget — live trade/construction news
// ────────────────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

export function IndustryNewsWidget() {
  const { data: news, isLoading, error } = useQuery<NewsItem[]>({
    queryKey: ['industry-news'],
    queryFn: async () => {
      const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.building.co.nz%2Frss');
      if (!res.ok) throw new Error('News fetch failed');
      const json = await res.json();
      return (json.items ?? []).slice(0, 8).map((item: Record<string, string>) => ({
        title: item.title ?? '',
        link: item.link ?? '#',
        source: item.author ?? item.creator ?? 'Industry',
        pubDate: item.pubDate ?? '',
        snippet: (item.description ?? '').replace(/<[^>]+>/g, '').slice(0, 120),
      }));
    },
    refetchInterval: 600000,
    retry: 1,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <Newspaper size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">Industry News</span>
        <span className="text-[9px] text-gray-400 ml-auto">Live</span>
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading news…</div>
        ) : error || !news?.length ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">News unavailable</div>
        ) : news.map((n, i) => (
          <a key={i} href={n.link} target="_blank" rel="noreferrer"
            className="block px-1.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors group">
            <p className="text-[11px] font-medium text-[#1A1A1A] leading-snug line-clamp-2 group-hover:text-[#2E75B6]">{n.title}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">
              {n.source}
              {n.pubDate && ` · ${formatDistanceToNow(new Date(n.pubDate), { addSuffix: true })}`}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Compliance Deadlines Widget — upcoming and overdue compliance items
// ────────────────────────────────────────────────────────────────────────────

export function ComplianceDeadlinesWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-compliance-deadlines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('id, title, type, expiry_date, status, assigned_to')
        .order('expiry_date', { ascending: true })
        .limit(20);
      if (error) throw error;
      const items = (data ?? []) as Array<Record<string, unknown>>;
      const today = new Date();
      const upcoming = items.filter(i => {
        const d = new Date(i.expiry_date as string);
        return isWithinInterval(d, { start: today, end: addDays(today, 30) });
      });
      const overdue = items.filter(i => {
        const d = new Date(i.expiry_date as string);
        return isPast(d) && i.status !== 'completed';
      });
      return { upcoming, overdue, all: items };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-[#2E75B6]" />
          <span className="text-xs font-semibold text-[#4A5568]">Compliance</span>
        </div>
        <Link to="/compliance" className="text-[10px] text-[#2E75B6] hover:underline">View all</Link>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (data?.overdue.length ?? 0) === 0 && (data?.upcoming.length ?? 0) === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-green-600">
          <CheckCircle size={18} className="mb-1" /> All compliant
        </div>
      ) : (
        <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1 min-h-0">
          {(data?.overdue ?? []).map((item: Record<string, unknown>) => (
            <Link key={item.id as string} to="/compliance"
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-[#1A1A1A] truncate">{item.title as string}</p>
                <p className="text-[9px] text-red-500 font-medium">
                  Overdue · {format(new Date(item.next_due_date as string), 'd MMM')}
                </p>
              </div>
            </Link>
          ))}
          {(data?.upcoming ?? []).map((item: Record<string, unknown>) => (
            <Link key={item.id as string} to="/compliance"
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors">
              <Clock size={14} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-[#1A1A1A] truncate">{item.title as string}</p>
                <p className="text-[9px] text-amber-600">
                  Due {format(new Date(item.next_due_date as string), 'd MMM')}
                  {' · '}
                  {formatDistanceToNow(new Date(item.next_due_date as string), { addSuffix: true })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cash Flow Widget — money in vs out this week
// ────────────────────────────────────────────────────────────────────────────

export function CashFlowWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-cash-flow'],
    queryFn: async () => {
      const weekStart = subDays(new Date(), 7).toISOString();
      const [{ data: paidInv }, { data: createdPOs }] = await Promise.all([
        supabase.from('invoices')
          .select('total, paid_at, status, updated_at')
          .eq('status', 'paid')
          .gte('updated_at', weekStart),
        supabase.from('purchase_orders')
          .select('total, status, created_at')
          .gte('created_at', weekStart),
      ]);
      const moneyIn = (paidInv ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const moneyOut = (createdPOs ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      return { moneyIn, moneyOut, net: moneyIn - moneyOut };
    },
  });

  const net = data?.net ?? 0;
  const inAmt = data?.moneyIn ?? 0;
  const outAmt = data?.moneyOut ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">Cash Flow (7d)</span>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-green-50 flex items-center justify-center">
                <ArrowUpRight size={12} className="text-green-600" />
              </div>
              <span className="text-xs text-[#4A5568]">Money In</span>
            </div>
            <span className="text-sm font-bold text-green-600">{formatMoney(inAmt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center">
                <ArrowDownRight size={12} className="text-red-500" />
              </div>
              <span className="text-xs text-[#4A5568]">Money Out</span>
            </div>
            <span className="text-sm font-bold text-red-500">{formatMoney(outAmt)}</span>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4A5568]">Net</span>
              <span className={`text-lg font-bold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {net >= 0 ? '+' : ''}{formatMoney(net)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI Scorecard Widget — all key metrics in one glance
// ────────────────────────────────────────────────────────────────────────────

export function KpiScorecardWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-kpi-scorecard'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [
        { count: openJobs },
        { count: inspectionsToday },
        { count: overdueInv },
        { count: lowStock },
      ] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
        supabase.from('inspections').select('*', { count: 'exact', head: true }).gte('started_at', today),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('stock_items').select('*', { count: 'exact', head: true }).eq('archived', false),
      ]);
      return {
        openJobs: openJobs ?? 0,
        inspectionsToday: inspectionsToday ?? 0,
        overdueInvoices: overdueInv ?? 0,
        stockItems: lowStock ?? 0,
      };
    },
  });

  const kpis = [
    { label: 'Active Jobs', value: data?.openJobs ?? 0, icon: Briefcase, color: 'text-[#2E75B6]', bg: 'bg-[#EFF6FF]' },
    { label: 'Inspections Today', value: data?.inspectionsToday ?? 0, icon: FileText, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Overdue Inv.', value: data?.overdueInvoices ?? 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Stock Items', value: data?.stockItems ?? 0, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">KPI Scorecard</span>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-2">
          {kpis.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="flex flex-col items-center justify-center rounded-lg bg-[#F9FAFB] py-2">
                <div className={`w-7 h-7 rounded-md ${k.bg} flex items-center justify-center mb-1`}>
                  <Icon size={13} className={k.color} />
                </div>
                <span className={`text-lg font-bold ${k.color}`}>{k.value}</span>
                <span className="text-[9px] text-[#4A5568] text-center leading-tight">{k.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Team Activity Widget — recent actions by team members
// ────────────────────────────────────────────────────────────────────────────

export function TeamActivityWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-team-activity'],
    queryFn: async () => {
      const { data: inspections } = await supabase
        .from('inspections')
        .select('id, status, meta, started_at, completed_at, inspector_id')
        .order('started_at', { ascending: false })
        .limit(8);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url');
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));
      return (inspections ?? []).map((insp) => {
        const meta = insp.meta as Record<string, string>;
        const isComplete = insp.status === 'completed' || insp.status === 'issued';
        return {
          id: insp.id,
          site: meta?.siteName ?? 'Untitled',
          person: profileMap.get(insp.inspector_id as string) ?? 'Team member',
          action: isComplete ? 'completed inspection' : 'started inspection',
          time: insp.completed_at ?? insp.started_at,
          status: insp.status,
        };
      });
    },
  });

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <Users size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">Team Activity</span>
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !data?.length ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">No recent activity</div>
        ) : data.map(a => (
          <div key={a.id} className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-[#2E75B6] flex items-center justify-center shrink-0">
              <span className="text-[9px] font-semibold text-white">{initials(a.person)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#1A1A1A] truncate">
                <span className="font-medium">{a.person}</span> {a.action}
              </p>
              <p className="text-[9px] text-gray-400 truncate">{a.site}</p>
            </div>
            <span className="text-[9px] text-gray-400 shrink-0">
              {formatDistanceToNow(new Date(a.time), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Agent Reminders Widget — reminders created by the AI agent, with complete
// ────────────────────────────────────────────────────────────────────────────

export function AgentRemindersWidget() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['widget-agent-reminders'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console/reminders`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) throw new Error('Failed to load reminders');
      const json = await res.json();
      return (json.reminders ?? []) as Array<{
        id: string; title: string; due_date: string | null;
        completed: boolean; related_type: string | null; created_at: string;
      }>;
    },
  });

  const complete = useCallback(async (id: string) => {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console/reminders/${id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    });
    queryClient.invalidateQueries({ queryKey: ['widget-agent-reminders'] });
  }, [session, queryClient]);

  const pending = (data ?? []).filter(r => !r.completed).slice(0, 8);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <CheckCircle size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">Agent Reminders</span>
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !pending.length ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 text-center px-2">
            <CheckCircle size={18} className="mb-1 text-green-500" />
            No pending reminders.<br />Ask the agent to create one.
          </div>
        ) : pending.map(r => (
          <div key={r.id} className="flex items-start gap-2 group">
            <button onClick={() => complete(r.id)}
              className="w-4 h-4 rounded border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 shrink-0 mt-0.5 transition-colors" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#1A1A1A] leading-snug">{r.title}</p>
              {r.due_date && (
                <p className="text-[9px] text-gray-400 mt-0.5">
                  Due {format(new Date(r.due_date), 'd MMM')} · {formatDistanceToNow(new Date(r.due_date), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Agent Activity Widget — live log of actions the agent has taken
// ────────────────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, { icon: typeof Bot; color: string; bg: string }> = {
  send_email: { icon: Send, color: 'text-[#2E75B6]', bg: 'bg-[#EFF6FF]' },
  create_job: { icon: Briefcase, color: 'text-green-600', bg: 'bg-green-50' },
  create_reminder: { icon: CheckCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
  create_compliance_item: { icon: Shield, color: 'text-[#2E75B6]', bg: 'bg-[#EFF6FF]' },
  web_search: { icon: Newspaper, color: 'text-purple-600', bg: 'bg-purple-50' },
  query_database: { icon: Activity, color: 'text-gray-600', bg: 'bg-gray-100' },
  execute_sql: { icon: Wrench, color: 'text-gray-600', bg: 'bg-gray-100' },
  other: { icon: Bot, color: 'text-[#2E75B6]', bg: 'bg-[#EFF6FF]' },
};

export function AgentActivityWidget() {
  const { session } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['widget-agent-activity'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-console/actions`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) throw new Error('Failed to load actions');
      const json = await res.json();
      return (json.actions ?? []) as Array<{
        id: string; action_type: string; tool_name: string | null;
        summary: string; status: string; created_at: string;
      }>;
    },
    refetchInterval: 15000,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <Activity size={14} className="text-[#2E75B6]" />
        <span className="text-xs font-semibold text-[#4A5568]">Agent Activity</span>
        <span className="text-[9px] text-gray-400 ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
        </span>
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">Loading…</div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 text-center px-2">
            <Bot size={18} className="mb-1 text-gray-300" />
            No actions yet.<br />Ask the agent to do something.
          </div>
        ) : data.map(a => {
          const cfg = ACTION_ICONS[a.action_type] ?? ACTION_ICONS.other;
          const Icon = cfg.icon;
          const failed = a.status === 'failed';
          return (
            <div key={a.id} className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <div className={`w-6 h-6 rounded-md ${cfg.bg} flex items-center justify-center shrink-0`}>
                <Icon size={12} className={failed ? 'text-red-500' : cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] leading-snug ${failed ? 'text-red-600' : 'text-[#1A1A1A]'}`}>
                  {a.summary}
                </p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {a.action_type.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

import { formatMoney } from '../types/fsm';
