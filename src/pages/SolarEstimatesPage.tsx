import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Sun, Trash2, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader, EmptyState, useToast } from '../components/ui';
import { SkeletonRow } from '../components/ui/Skeletons';
import { SolarWizard, SOLAR_WIZARD_MAX_STEP } from '../features/solar-calculator/components/SolarWizard';
import { blankSolarInputs, type SolarEstimateInputs } from '../features/solar-calculator/draft';
import { computeSolarOutputs, mergeInputs } from '../features/solar-calculator/compute';
import { formatMoney } from '../types/fsm';

function clampSolarStep(n: number) {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), SOLAR_WIZARD_MAX_STEP);
}

type SolarQuoteRow = {
  id: string;
  title: string;
  status: string;
  current_step: number;
  inputs: unknown;
  outputs: unknown;
  midscale_acknowledged: boolean;
  client_id: string | null;
  updated_at: string;
  created_at: string;
};

export function SolarEstimatesPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [inputs, setInputs] = useState<SolarEstimateInputs>(blankSolarInputs);
  const [midscaleAck, setMidscaleAck] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: quotes = [], isLoading, refetch } = useQuery<SolarQuoteRow[]>({
    queryKey: ['solar-quotes', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solar_quotes')
        .select('id, title, status, current_step, inputs, outputs, midscale_acknowledged, client_id, updated_at, created_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SolarQuoteRow[];
    },
    enabled: !!profile?.company_id,
  });

  const { data: clients = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['solar-estimate-clients', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id,
  });

  const openNew = () => {
    setEditingId(null);
    setInputs(blankSolarInputs());
    setStep(1);
    setMidscaleAck(false);
    setCreating(true);
  };

  const openExisting = (row: SolarQuoteRow) => {
    setEditingId(row.id);
    setInputs(mergeInputs(row.inputs));
    setStep(clampSolarStep(row.current_step || 1));
    setMidscaleAck(!!row.midscale_acknowledged);
    setCreating(true);
  };

  const patchInputs = useCallback((patch: Partial<SolarEstimateInputs>) => {
    setInputs(prev => ({ ...prev, ...patch }));
  }, []);

  const save = async () => {
    if (!profile?.company_id) return;
    setSaving(true);
    try {
      const outputs = computeSolarOutputs(inputs);
      const title =
        inputs.customerName.trim() ||
        (inputs.siteAddress.trim() ? `Site: ${inputs.siteAddress.trim()}` : 'Solar estimate');
      const payload = {
        title,
        client_id: inputs.clientId,
        current_step: clampSolarStep(step),
        inputs,
        outputs,
        midscale_acknowledged: midscaleAck,
        status: clampSolarStep(step) >= SOLAR_WIZARD_MAX_STEP ? 'complete' : 'draft',
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('solar_quotes').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('solar_quotes')
          .insert({
            ...payload,
            company_id: profile.company_id,
            created_by: profile.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        setEditingId(data.id);
      }
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['solar-quotes'] });
      showToast('Estimate saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed — is the solar_quotes migration applied?');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this solar estimate?')) return;
    await supabase.from('solar_quotes').delete().eq('id', id);
    await refetch();
    if (editingId === id) {
      setCreating(false);
      setEditingId(null);
    }
  };

  // Autosave hint when leaving wizard — optional debounce save on step change
  useEffect(() => {
    // no-op placeholder for future autosave
  }, [step]);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader
          title="Solar estimates"
          subtitle="Quick STC rebate estimate — optional savings if you have usage figures"
          action={
            !creating ? (
              <button type="button" onClick={openNew}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md">
                <Plus size={16} /> New estimate
              </button>
            ) : undefined
          }
        />

        {creating ? (
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 sm:p-5 min-h-[70vh] flex flex-col">
            <SolarWizard
              inputs={inputs}
              step={step}
              midscaleAck={midscaleAck}
              clients={clients}
              saving={saving}
              onChange={patchInputs}
              onStep={n => setStep(clampSolarStep(n))}
              onMidscaleAck={setMidscaleAck}
              onSave={save}
              onClose={() => { setCreating(false); setEditingId(null); }}
            />
          </div>
        ) : (
          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <SkeletonRow /><SkeletonRow /><SkeletonRow />
              </div>
            ) : quotes.length === 0 ? (
              <EmptyState
                icon={Sun}
                title="No solar estimates yet"
                message="Build a customer-facing STC & ROI business case. Drafts save so you can resume on site."
                action={
                  <button type="button" onClick={openNew}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md">
                    <Plus size={16} /> New estimate
                  </button>
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] text-xs text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Title</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Updated</th>
                    <th className="px-4 py-2.5 text-right">Rebate (mid)</th>
                    <th className="px-4 py-2.5 text-right w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {quotes.map(q => {
                    const outs = q.outputs as { sizes?: Array<{ rebateMidCents: number }> } | null;
                    const mid = outs?.sizes?.[0]?.rebateMidCents;
                    return (
                      <tr key={q.id} className="hover:bg-[#F9FAFB]">
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{q.title}</td>
                        <td className="px-4 py-3 capitalize text-[#6B7280]">{q.status}</td>
                        <td className="px-4 py-3 text-[#6B7280]">
                          {format(parseISO(q.updated_at), 'dd MMM yyyy HH:mm')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {mid != null ? formatMoney(mid / 100) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => openExisting(q)}
                            className="inline-flex p-1.5 text-[#2E75B6] hover:bg-blue-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => void remove(q.id)}
                            className="inline-flex p-1.5 text-[#9CA3AF] hover:text-red-600 rounded" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
