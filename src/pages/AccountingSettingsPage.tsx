import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { format, parseISO } from 'date-fns';
import { Building2, Check, X, RefreshCw, AlertCircle, Construction, Settings as SettingsIcon } from 'lucide-react';
import {
  ACCOUNTING_SETTINGS_PATH,
  ACCOUNTING_SETTINGS_PUBLIC_COLUMNS,
  XERO_FUNCTION_NAME,
  canUseAccountingSettings,
  parseXeroCallbackSearch,
  preferenceInsertDefaults,
  preferenceSavePayload,
  readXeroFunctionResult,
  xeroMissMessage,
} from '../lib/xeroAccounting';

export function AccountingSettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [provider, setProvider] = useState('none');
  const [autoSync, setAutoSync] = useState(false);
  const [syncInvoices, setSyncInvoices] = useState(true);
  const [syncPayments, setSyncPayments] = useState(true);
  const [syncSuppliers, setSyncSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'miss'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<'connect' | 'sync' | 'disconnect' | 'callback' | null>(null);
  const callbackLock = useRef(false);

  const isAdmin = canUseAccountingSettings(profile?.role);

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['accounting-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_settings')
        .select(ACCOUNTING_SETTINGS_PUBLIC_COLUMNS)
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

  const connected = settings?.provider === 'xero'
    && settings?.connection_status === 'connected'
    && Boolean(settings?.tenant_id);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = preferenceSavePayload({
        companyId: profile!.company_id,
        provider,
        autoSync,
        syncInvoices,
        syncPayments,
        syncSuppliers,
      });
      if (settings) {
        const { error } = await supabase.from('accounting_settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounting_settings').insert(preferenceInsertDefaults(payload));
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

  async function invokeXero(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke(XERO_FUNCTION_NAME, { body });
    return readXeroFunctionResult(data, error);
  }

  function accountingRedirectUri() {
    return `${window.location.origin}${ACCOUNTING_SETTINGS_PATH}`;
  }

  function clearCallbackParams() {
    navigate(ACCOUNTING_SETTINGS_PATH, { replace: true });
  }

  async function handleConnect() {
    setActionMsg(null);
    setBusyAction('connect');
    try {
      const result = await invokeXero({
        action: 'connect',
        provider,
        redirectUri: accountingRedirectUri(),
      });
      if (!result.ok) {
        setActionMsg({ kind: 'miss', text: result.message });
        return;
      }
      const url = String(result.body.authorizeUrl ?? '');
      if (!url) {
        setActionMsg({ kind: 'miss', text: xeroMissMessage('token_failed') });
        return;
      }
      window.location.assign(url);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSync() {
    setActionMsg(null);
    setBusyAction('sync');
    try {
      const result = await invokeXero({ action: 'sync' });
      if (!result.ok) {
        setActionMsg({ kind: 'miss', text: result.message });
        return;
      }
      setActionMsg({ kind: 'ok', text: String(result.body.message ?? 'Synced paid invoices to Xero.') });
      queryClient.invalidateQueries({ queryKey: ['accounting-settings'] });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    setActionMsg(null);
    setBusyAction('disconnect');
    try {
      const result = await invokeXero({ action: 'disconnect' });
      if (!result.ok) {
        setActionMsg({ kind: 'miss', text: result.message });
        return;
      }
      setActionMsg({ kind: 'ok', text: 'Xero disconnected. Tokens and tenant were cleared.' });
      queryClient.invalidateQueries({ queryKey: ['accounting-settings'] });
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    if (!isAdmin || callbackLock.current) return;
    const parsed = parseXeroCallbackSearch(window.location.search);
    if (!window.location.search) return;
    callbackLock.current = true;
    if (!parsed.ok) {
      setActionMsg({ kind: 'miss', text: xeroMissMessage(parsed.code) });
      clearCallbackParams();
      return;
    }
    setBusyAction('callback');
    void invokeXero({
      action: 'callback',
      code: parsed.code,
      state: parsed.state,
      redirectUri: accountingRedirectUri(),
    }).then((result) => {
      if (!result.ok) setActionMsg({ kind: 'miss', text: result.message });
      else {
        setActionMsg({ kind: 'ok', text: 'Xero connected.' });
        queryClient.invalidateQueries({ queryKey: ['accounting-settings'] });
      }
    }).finally(() => {
      setBusyAction(null);
      clearCallbackParams();
    });
  }, [isAdmin, queryClient, navigate]);

  if (profile && !isAdmin) return <Navigate to="/" replace />;
  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error) return <AppShell><PageError message="Could not load accounting settings" /></AppShell>;

  return (
    <AppShell>
      <div className="page-shell-narrow">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Accounting Integration</h1>
          <p className="text-sm text-[#4A5568] mt-0.5">Connect Xero and push paid invoices from this company</p>
        </div>

        <div className={`rounded-xl p-4 mb-4 border ${connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${connected ? 'bg-green-100' : 'bg-amber-100'}`}>
              {connected
                ? <Check size={20} className="text-green-700" />
                : <Construction size={20} className="text-amber-700" />}
            </div>
            <div>
              <p className={`text-sm font-medium ${connected ? 'text-green-900' : 'text-amber-900'}`}>
                {connected ? 'Xero connected' : 'Xero connect is live on this page'}
              </p>
              <p className={`text-xs mt-0.5 ${connected ? 'text-green-800' : 'text-amber-800'}`}>
                {connected
                  ? `Tenant ${settings?.tenant_id}. Sync pushes paid invoices only.`
                  : 'Connect starts a real Xero OAuth path. QuickBooks Connect stays an honest miss for this slice.'}
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
              <ToggleRow label="Automatic sync" description="Saved preference only — this slice syncs when you click Sync" checked={autoSync} onChange={setAutoSync} />
              <ToggleRow label="Sync invoices" description="Push paid invoices to Xero" checked={syncInvoices} onChange={setSyncInvoices} />
              <ToggleRow label="Sync payments" description="Saved preference only — this slice does not run a payments sync" checked={syncPayments} onChange={setSyncPayments} />
              <ToggleRow label="Sync suppliers" description="Saved preference only — suppliers are not in this slice" checked={syncSuppliers} onChange={setSyncSuppliers} />
            </div>
            {settings?.last_synced_at && (
              <p className="text-xs text-[#4A5568] mt-3 flex items-center gap-1">
                <AlertCircle size={12} />
                Last synced: {format(parseISO(settings.last_synced_at), 'dd MMM yyyy, HH:mm')}
              </p>
            )}
          </div>
        )}

        {provider !== 'none' && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5 mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Connection</h2>
            <p className="text-sm text-[#4A5568] mb-3">
              {provider === 'xero'
                ? (connected ? `Connected to tenant ${settings?.tenant_id}.` : 'Not connected.')
                : 'QuickBooks is listed here only. Connect is not wired in this slice.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!connected && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={busyAction !== null}
                  className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
                >
                  {busyAction === 'connect' || busyAction === 'callback'
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <Building2 size={16} />}
                  Connect
                </button>
              )}
              {connected && provider === 'xero' && (
                <>
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
                  >
                    {busyAction === 'sync' ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Sync
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 border border-[#E5E7EB] text-[#1A1A1A] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] disabled:opacity-50"
                  >
                    {busyAction === 'disconnect' ? <RefreshCw size={16} className="animate-spin" /> : <X size={16} />}
                    Disconnect
                  </button>
                </>
              )}
            </div>
            {actionMsg && (
              <p className={`text-sm mt-3 ${actionMsg.kind === 'ok' ? 'text-green-700' : 'text-amber-800'}`}>
                {actionMsg.text}
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
