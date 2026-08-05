import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Copy, Check, Ban, Plus, RefreshCw, Link2, Clock, FileText, Receipt, Wrench } from 'lucide-react';
import type { Client } from '../types/crm';
import { formatMoney } from '../types/fsm';

export function CustomerPortalPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: tokens, isLoading, error } = useQuery({
    queryKey: ['portal-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_portal_tokens')
        .select(`
          id, token, expires_at, revoked, last_accessed_at, created_at,
          clients!inner(id, name, email)
        `)
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const createTokenMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase.from('client_portal_tokens').insert({
        company_id: profile!.company_id,
        client_id: clientId,
        token,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal-tokens'] }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_portal_tokens').update({ revoked: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal-tokens'] }),
  });

  const { data: clients } = useQuery({
    queryKey: ['clients-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email')
        .eq('company_id', profile!.company_id)
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Pick<Client, 'id' | 'name' | 'email'>[];
    },
    enabled: !!profile,
  });

  const filteredTokens = useMemo(() => {
    const all = tokens ?? [];
    const q = search.toLowerCase();
    if (!q) return all;
    return all.filter((t: { clients?: { name?: string; email?: string } }) => {
      const name = t.clients?.name ?? '';
      const email = t.clients?.email ?? '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [tokens, search]);

  const clientWithoutToken = useMemo(() => {
    const all = clients ?? [];
    const usedIds = new Set((tokens ?? []).map((t: { client_id: string }) => t.client_id));
    return all.filter(c => !usedIds.has(c.id));
  }, [clients, tokens]);

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error) return <AppShell><PageError message="Could not load portal tokens" /></AppShell>;

  const portalBase = typeof window !== 'undefined' ? `${window.location.origin}/portal` : '/portal';

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Customer Portal</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">Generate secure links for clients to view their quotes, invoices, and job status</p>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Link2 size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">How it works</p>
              <p className="text-sm text-blue-700 mt-0.5">Generate a unique portal link for each client. Share the link via email or SMS. Clients can view their active quotes, invoices, and job progress without logging in. Links expire after 1 year and can be revoked anytime.</p>
            </div>
          </div>
        </div>

        {/* Generate new token */}
        {clientWithoutToken.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Generate Portal Link</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select id="portal-client-select" className="form-input flex-1 min-w-[200px] cursor-pointer" defaultValue="">
                <option value="" disabled>Select a client...</option>
                {clientWithoutToken.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                onClick={() => {
                  const sel = document.getElementById('portal-client-select') as HTMLSelectElement;
                  if (sel.value) createTokenMutation.mutate(sel.value);
                }}
                className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
              >
                <Plus size={16} /> Generate Link
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by client name..."
            className="form-input" />
        </div>

        {/* Tokens table */}
        {filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <ExternalLink size={40} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-3">No portal links generated yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last Accessed</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                  <th className="px-4 py-2.5 font-medium">Portal Link</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filteredTokens.map((t: {
                  id: string; token: string; expires_at: string | null; revoked: boolean; last_accessed_at: string | null; created_at: string;
                  clients: { id: string; name: string; email: string | null };
                }) => (
                  <tr key={t.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1A1A1A]">{t.clients.name}</p>
                      {t.clients.email && <p className="text-xs text-[#6B7280]">{t.clients.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {t.revoked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><Ban size={12} /> Revoked</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"><Check size={12} /> Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568] text-xs">
                      {t.last_accessed_at ? format(parseISO(t.last_accessed_at), 'dd MMM yyyy, HH:mm') : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-[#4A5568] text-xs">
                      {t.expires_at ? format(parseISO(t.expires_at), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <code className="text-xs text-[#4A5568] bg-gray-100 px-2 py-0.5 rounded truncate max-w-[180px]">{portalBase}?t={t.token.slice(0, 12)}...</code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${portalBase}?t=${t.token}`);
                            setCopiedToken(t.id);
                            setTimeout(() => setCopiedToken(null), 2000);
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-[#6B7280]"
                          title="Copy full link"
                        >
                          {copiedToken === t.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!t.revoked && (
                        <button onClick={() => { if (confirm('Revoke this portal link? The client will no longer be able to access it.')) revokeMutation.mutate(t.id); }}
                          className="p-1 rounded hover:bg-red-50 text-[#B42318]" title="Revoke">
                          <Ban size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
