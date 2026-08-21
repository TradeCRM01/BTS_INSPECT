import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import { format, parseISO } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
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
      setActionMsg({ kind: 'ok', text: String(result.body.message ?? 'Synced invoices to Xero.') });
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

  const lastSynced = settings?.last_synced_at
    ? format(parseISO(settings.last_synced_at), 'dd MMM yyyy, HH:mm')
    : null;

  const missText = actionMsg?.kind === 'miss'
    ? actionMsg.text
    : !connected
      ? (provider === 'quickbooks' ? xeroMissMessage('quickbooks_not_in_slice') : xeroMissMessage('not_connected'))
      : null;

  return (
    <AppShell>
      <div id="accounting-settings">
        <div className="acct-page">
          <h1 className="ops-page-title">Accounting</h1>

          <section className="ops-tray">
            <div className="ops-tray-head">
              <h2 className="ops-section-title">Xero</h2>
            </div>
            <div className="acct-body">
              {connected ? (
                <>
                  <p className="acct-status">Xero connected</p>
                  <p className="acct-meta">
                    Tenant {settings?.tenant_id}
                    {lastSynced ? ` · Last synced ${lastSynced}` : ''}
                  </p>
                </>
              ) : null}
              {missText && <p className="acct-miss">{missText}</p>}
              {actionMsg?.kind === 'ok' && <p className="acct-meta">{actionMsg.text}</p>}
              {savedMsg && <p className="acct-meta">Saved</p>}

              <div className="acct-act">
                {connected ? (
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={busyAction !== null}
                    className="btn-primary"
                  >
                    {busyAction === 'sync' ? 'Syncing…' : 'Sync now'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={busyAction !== null}
                    className="btn-primary"
                  >
                    {busyAction === 'connect' || busyAction === 'callback' ? 'Connecting…' : 'Connect Xero'}
                  </button>
                )}
                <details className="acct-more">
                  <summary aria-label="More">
                    <MoreHorizontal size={16} />
                  </summary>
                  <div className="acct-more-menu">
                    {connected && (
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={busyAction !== null}
                      >
                        {busyAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    )}
                    <button type="button" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save preferences'}
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <section className="ops-tray">
            <div className="ops-tray-head">
              <h2 className="ops-section-title">Preferences</h2>
            </div>
            <div className="acct-body">
              <div className="acct-choices" role="group" aria-label="Provider">
                <ProviderChoice name="None" active={provider === 'none'} onClick={() => setProvider('none')} />
                <ProviderChoice name="Xero" active={provider === 'xero'} onClick={() => setProvider('xero')} />
                <ProviderChoice name="QuickBooks" active={provider === 'quickbooks'} onClick={() => setProvider('quickbooks')} />
              </div>

              {provider !== 'none' && (
                <div className="acct-toggles">
                  <ToggleRow
                    label="Automatic sync"
                    description="Saved preference only — this slice syncs when you click Sync now"
                    checked={autoSync}
                    onChange={setAutoSync}
                  />
                  <ToggleRow
                    label="Sync invoices"
                    description="Push sent and paid invoices to Xero"
                    checked={syncInvoices}
                    onChange={setSyncInvoices}
                  />
                  <ToggleRow
                    label="Sync payments"
                    description="Attach a payment in Xero when Mark paid succeeds. Does not pull Xero payments into Relovi."
                    checked={syncPayments}
                    onChange={setSyncPayments}
                  />
                  <ToggleRow
                    label="Sync suppliers"
                    description="Saved preference only — suppliers are not in this slice"
                    checked={syncSuppliers}
                    onChange={setSyncSuppliers}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function ProviderChoice({ name, active, onClick }: {
  name: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`acct-choice${active ? ' is-on' : ''}`}
    >
      {name}
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="acct-toggle">
      <span>
        <span className="acct-toggle-label">{label}</span>
        <span className="acct-meta">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`acct-switch${checked ? ' is-on' : ''}`}
      >
        <span className="acct-switch-knob" />
      </button>
    </label>
  );
}
