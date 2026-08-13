import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { format, parseISO } from 'date-fns';
import { Building2, Check, X, RefreshCw, AlertCircle, Construction, Settings as SettingsIcon } from 'lucide-react';

export function AccountingSettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState('none');
  const [autoSync, setAutoSync] = useState(false);
  const [syncInvoices, setSyncInvoices] = useState(true);
  const [syncPayments, setSyncPayments] = useState(true);
  const [syncSuppliers, setSyncSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['accounting-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_settings')
        .select('*')
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile && isAdmin,
  });

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider ?? 'none');
      setAutoSync(settings.auto_sync ?? false);
      setSyncInvoices(settings.sync_invoices ?? true);
      setSyncPayments(settings.sync_payments ?? true);
      setSyncSuppliers(settings.sync_suppliers ?? false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: profile!.company_id,
        provider,
        auto_sync: autoSync,
        sync_invoices: syncInvoices,
        sync_payments: syncPayments,
        sync_suppliers: syncSuppliers,
        connection_status: 'disconnected',
        updated_at: new Date().toISOString(),
      };
      if (settings) {
        const { error } = await supabase.from('accounting_settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounting_settings').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-settings'] });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    },
  });

  const handleSave = () => {
    setSaving(true);
    saveMutation.mutate(undefined, { onSettled: () => setSaving(false) });
  };

  if (profile && !isAdmin) return <Navigate to="/" replace />;
  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error) return <AppShell><PageError message="Could not load accounting settings" /></AppShell>;

  return (
    <AppShell>
      <div className="page-shell-narrow">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Accounting Integration</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">Prepare preferences for Xero or QuickBooks sync</p>
        </div>

        <div className="rounded-xl p-4 mb-4 border bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 shrink-0">
              <Construction size={20} className="text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900">OAuth connection coming soon</p>
              <p className="text-xs text-amber-800 mt-0.5">
                You can save preferred provider and sync options now. Live Connect / Sync for Xero and QuickBooks is not wired yet â€” those buttons previously did nothing.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Select Provider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ProviderCard
              name="None" icon={X} description="No integration"
              active={provider === 'none'} onClick={() => setProvider('none')} color="#6B7280"
            />
            <ProviderCard
              name="Xero" icon={Building2} description="Cloud accounting"
              active={provider === 'xero'} onClick={() => setProvider('xero')} color="#13B5EA"
            />
            <ProviderCard
              name="QuickBooks" icon={Building2} description="Intuit accounting"
              active={provider === 'quickbooks'} onClick={() => setProvider('quickbooks')} color="#2CA01C"
            />
          </div>
        </div>

        {provider !== 'none' && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5 mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Sync Settings</h2>
            <div className="space-y-3">
              <ToggleRow label="Automatic sync" description="Sync data automatically every hour" checked={autoSync} onChange={setAutoSync} />
              <ToggleRow label="Sync invoices" description="Push invoices to accounting software" checked={syncInvoices} onChange={setSyncInvoices} />
              <ToggleRow label="Sync payments" description="Record payments in accounting software" checked={syncPayments} onChange={setSyncPayments} />
              <ToggleRow label="Sync suppliers" description="Keep supplier records in sync" checked={syncSuppliers} onChange={setSyncSuppliers} />
            </div>
            {settings?.last_synced_at && (
              <p className="text-xs text-[#4A5568] mt-3 flex items-center gap-1">
                <AlertCircle size={12} />
                Last synced: {format(parseISO(settings.last_synced_at), 'dd MMM yyyy, HH:mm')}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {savedMsg && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><Check size={16} /> Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <SettingsIcon size={16} />}
            Save Settings
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function ProviderCard({ name, icon: Icon, description, active, onClick, color }: {
  name: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <button onClick={onClick}
      className={`p-4 rounded-lg border-2 text-left transition-all ${
        active ? 'border-[#0A2540] bg-blue-50' : 'border-[#E5E7EB] hover:border-[#9CA3AF] bg-white'
      }`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-sm font-semibold text-[#1A1A1A]">{name}</span>
      </div>
      <p className="text-xs text-[#4A5568]">{description}</p>
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between p-3 rounded-lg border border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] transition-colors">
      <div>
        <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
        <p className="text-xs text-[#4A5568]">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-[#0A2540]' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  );
}
