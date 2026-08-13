import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import SignatureCanvas from 'react-signature-canvas';
import { ChevronLeft, Download, Printer, Save, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError } from '../components/ui';
import { generateTake5Pdf } from '../reports/generateTake5Pdf';

type Take5Row = {
  id: string;
  jha_document_id: string;
  status: string;
  meta: Record<string, string>;
  stop_think: string;
  identify_hazards: string;
  assess_risk: string;
  control_actions: string;
  go_no_go: 'go' | 'stop';
  signed_name: string | null;
  signature: string | null;
  signed_at: string | null;
};

export function Take5Page() {
  const [params] = useSearchParams();
  const jhaId = params.get('jhaId');
  const take5Id = params.get('id');
  const navigate = useNavigate();
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const sigRef = useRef<SignatureCanvas>(null);

  const [rowId, setRowId] = useState<string | null>(take5Id);
  const [stopThink, setStopThink] = useState('');
  const [identify, setIdentify] = useState('');
  const [assess, setAssess] = useState('');
  const [controls, setControls] = useState('');
  const [goNoGo, setGoNoGo] = useState<'go' | 'stop'>('go');
  const [signedName, setSignedName] = useState(profile?.name ?? '');
  const [meta, setMeta] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    location: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { data: jha, isLoading: jhaLoading } = useQuery({
    queryKey: ['jha-for-take5', jhaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_documents')
        .select('id, report_number, meta, status, template_snapshot')
        .eq('id', jhaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!jhaId,
  });

  const { data: existing, isLoading: take5Loading } = useQuery({
    queryKey: ['jha-take5', take5Id],
    queryFn: async () => {
      const { data, error } = await supabase.from('jha_take5').select('*').eq('id', take5Id!).maybeSingle();
      if (error) throw error;
      return data as Take5Row;
    },
    enabled: !!take5Id,
  });

  useEffect(() => {
    if (!existing) return;
    setRowId(existing.id);
    setStopThink(existing.stop_think || '');
    setIdentify(existing.identify_hazards || '');
    setAssess(existing.assess_risk || '');
    setControls(existing.control_actions || '');
    setGoNoGo(existing.go_no_go === 'stop' ? 'stop' : 'go');
    setSignedName(existing.signed_name || profile?.name || '');
    setMeta({
      date: existing.meta?.date || format(new Date(), 'yyyy-MM-dd'),
      time: existing.meta?.time || format(new Date(), 'HH:mm'),
      location: existing.meta?.location || '',
    });
  }, [existing, profile?.name]);

  async function save(status: 'draft' | 'completed' = 'draft') {
    if (!profile || !jhaId) return;
    setSaving(true);
    setError('');
    try {
      const signature = status === 'completed'
        ? (sigRef.current && !sigRef.current.isEmpty()
          ? sigRef.current.toDataURL('image/png')
          : existing?.signature ?? null)
        : existing?.signature ?? null;

      if (status === 'completed' && !signature) {
        throw new Error('Sign the Take 5 before completing');
      }
      if (status === 'completed' && (!stopThink.trim() || !identify.trim() || !controls.trim())) {
        throw new Error('Complete Stop & think, Identify hazards, and Control actions');
      }

      const payload = {
        company_id: profile.company_id,
        jha_document_id: jhaId,
        created_by: profile.id,
        status,
        meta,
        stop_think: stopThink,
        identify_hazards: identify,
        assess_risk: assess,
        control_actions: controls,
        go_no_go: goNoGo,
        signed_name: signedName,
        signature,
        signed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (rowId) {
        const { error: upErr } = await supabase.from('jha_take5').update(payload).eq('id', rowId);
        if (upErr) throw upErr;
      } else {
        const { data, error: inErr } = await supabase.from('jha_take5').insert(payload).select().maybeSingle();
        if (inErr) throw inErr;
        if (data) {
          setRowId(data.id);
          navigate(`/jha/take5?jhaId=${jhaId}&id=${data.id}`, { replace: true });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['jha-take5-list', jhaId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishPdf() {
    if (!profile || !company || !jha) return;
    await save('completed');
    const blob = await generateTake5Pdf({
      parentReportNumber: jha.report_number || '',
      parentTaskName: (jha.meta as Record<string, string>)?.taskName || '',
      parentSiteName: (jha.meta as Record<string, string>)?.siteName || '',
      companyName: company.name,
      companyLogoUrl: company.logo_url,
      inspectorName: profile.name,
      date: meta.date,
      time: meta.time,
      location: meta.location,
      stopThink,
      identifyHazards: identify,
      assessRisk: assess,
      controlActions: controls,
      goNoGo,
      signedName,
      signature: sigRef.current && !sigRef.current.isEmpty()
        ? sigRef.current.toDataURL('image/png')
        : existing?.signature ?? null,
      signedAt: format(new Date(), 'd MMM yyyy HH:mm'),
    });
    const url = URL.createObjectURL(blob);
    setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
  }

  if (!jhaId) {
    return (
      <AppShell>
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <PageError message="Take 5 requires a parent JHA. Open a JHA first." onRetry={() => navigate('/jha')} />
        </div>
      </AppShell>
    );
  }

  if (jhaLoading || take5Loading) {
    return <AppShell><div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div></AppShell>;
  }

  const task = (jha?.meta as Record<string, string> | undefined)?.taskName;

  return (
    <AppShell>
      <div className="max-w-[800px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link to={`/jha/new?docId=${jhaId}`} className="flex items-center gap-1 text-sm text-[#4A5568] hover:text-[#1A1A1A]">
            <ChevronLeft size={16} /> Back to JHA
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => save('draft')} disabled={saving} className="flex items-center gap-1.5 border border-[#E5E7EB] px-3 py-2 rounded-md text-sm">
              <Save size={14} /> Save draft
            </button>
            <button type="button" onClick={handlePublishPdf} disabled={saving} className="flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm">
              <Printer size={14} /> Complete & PDF
            </button>
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-xl font-semibold text-[#1A1A1A] flex items-center gap-2">
            <ShieldAlert size={20} /> Take 5 / POWRA
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Companion to {jha?.report_number || 'JHA'}{task ? ` — ${task}` : ''}. Supplements the parent JHA; does not replace it.
          </p>
        </div>

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Date" type="date" value={meta.date} onChange={v => setMeta(m => ({ ...m, date: v }))} />
            <Field label="Time" type="time" value={meta.time} onChange={v => setMeta(m => ({ ...m, time: v }))} />
            <Field label="Location / face" value={meta.location} onChange={v => setMeta(m => ({ ...m, location: v }))} />
          </div>

          <Area label="1. Stop & think — what am I about to do?" value={stopThink} onChange={setStopThink} />
          <Area label="2. Identify hazards — what could hurt me or others?" value={identify} onChange={setIdentify} />
          <Area label="3. Assess the risk — how bad / how likely?" value={assess} onChange={setAssess} />
          <Area label="4. Control actions — what will I do to stay safe?" value={controls} onChange={setControls} />

          <div>
            <label className="text-xs font-medium text-[#4A5568] mb-2 block">5. Go / No-go</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGoNoGo('go')}
                className={`flex-1 py-2 rounded-md text-sm font-medium border ${goNoGo === 'go' ? 'bg-green-50 border-green-300 text-green-800' : 'border-[#E5E7EB]'}`}
              >
                GO — proceed
              </button>
              <button
                type="button"
                onClick={() => setGoNoGo('stop')}
                className={`flex-1 py-2 rounded-md text-sm font-medium border ${goNoGo === 'stop' ? 'bg-red-50 border-red-300 text-red-800' : 'border-[#E5E7EB]'}`}
              >
                STOP — do not proceed
              </button>
            </div>
          </div>

          <Field label="Name" value={signedName} onChange={setSignedName} />
          <div>
            <label className="text-xs font-medium text-[#4A5568] mb-1 block">Signature</label>
            <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: 'w-full h-36' }}
                backgroundColor="#fff"
              />
            </div>
            <button type="button" className="text-xs text-[#6B7280] mt-1 hover:underline" onClick={() => sigRef.current?.clear()}>
              Clear signature
            </button>
          </div>
        </div>

        {pdfUrl && (
          <div className="mt-4 bg-white rounded-xl border border-[#E5E7EB] p-4 flex items-center justify-between">
            <span className="text-sm font-medium">Take 5 PDF ready</span>
            <a href={pdfUrl} download={`Take5-${jha?.report_number || 'draft'}.pdf`} className="flex items-center gap-1.5 text-sm text-[#2E75B6]">
              <Download size={14} /> Download
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label, value, onChange, type = 'text',
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#4A5568] mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2" />
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#4A5568] mb-1 block">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full text-sm border border-[#E5E7EB] rounded px-3 py-2 resize-none" />
    </div>
  );
}
