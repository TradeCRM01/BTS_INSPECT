import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth } from '../lib/devFieldAuditAuth';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { Check, Upload, Plus, Trash2, Mail, Eye, EyeOff, AlertCircle, CheckCircle2, Users, Palette, Download } from 'lucide-react';
import { companyExportClientFromSupabase, downloadCompanyExport } from '../lib/companyExport';
import {
  COMPANY_LOGO_ACCEPT,
  companyLogoClientFromSupabase,
  companyLogoCropFrom,
  companyLogoLetterheadClientFromSupabase,
  companyLogoLetterheadSizePx,
  companyWithLetterheadLookMark,
  decideCompanyLogoUpload,
  persistCompanyLogo,
  persistCompanyLogoLetterhead,
  removeCompanyLogo,
  type CompanyLogoCrop,
} from '../lib/companyLogo';
import { CompanyLogoStripCrop } from '../lib/CompanyLogoStripCrop';
import {
  blankCompanyPaymentMethod,
  COMPANY_PAYMENT_KIND_LABEL,
  companyPaymentMethodsSaveError,
  companyPaymentMethodsSavePayload,
  parseCompanyPaymentMethods,
  type CompanyPaymentKind,
  type CompanyPaymentMethod,
} from '../lib/companyPaymentMethods';

/** Page-local company settings sheet. Same tokens as signed team / open-record. */
const COMPANY_LOOK_CSS = `
.hub-company {
  --co-look-page: #F5F0E6;
  --co-look-sheet: #FFFDF8;
  --co-look-ink: #0A2540;
  --co-look-muted: #5B6B7C;
  --co-look-line: #E2D9CC;
  --co-look-action: #2E75B6;
  --co-look-r-ctl: 12px;
  --co-look-r-sheet: 16px;
  --co-look-fail: #B42318;
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-company.ops-page {
  max-width: none;
  width: 100%;
  min-height: calc(100dvh - 3.5rem);
  margin: 0;
  background: var(--co-look-page);
  color: var(--co-look-ink);
  padding: 24px 24px 48px;
}
.hub-company-label {
  display: block;
  max-width: 1100px;
  margin: 0 auto 16px;
  padding-top: 8px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--co-look-muted);
}
.hub-company-sheet {
  max-width: 1100px;
  margin: 0 auto 24px;
  background: var(--co-look-sheet);
  border: 1px solid var(--co-look-line);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-company-sheet-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 24px;
  background: var(--co-look-ink);
  color: #fff;
}
.hub-company-sheet-bar-meta {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
}
.hub-company-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
  width: fit-content;
  white-space: nowrap;
  background: #fff;
  color: var(--co-look-ink);
}
.hub-company-sheet-body {
  padding: 32px 32px 24px;
  background: var(--co-look-sheet);
  box-shadow: inset 0 1px 0 #fff;
}
.hub-company-hero {
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: 0.02em;
  line-height: 0.96;
  color: var(--co-look-ink);
  margin: 0;
}
.hub-company-jobline {
  margin: 8px 0 0;
  color: #2E75B6;
  font-size: 16px;
  font-weight: 500;
}
.hub-company-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}
.hub-company-next {
  background: #2E75B6;
  color: #fff;
  min-height: 44px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}
.hub-company-next:hover {
  background: color-mix(in srgb, #2E75B6 86%, #0A2540);
  color: #fff;
}
.hub-company-next:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-company-sub {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 12px;
  color: #2E75B6;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  box-shadow: none;
  cursor: pointer;
}
.hub-company-sub:hover { color: var(--co-look-ink); }
.hub-company-sub.is-quiet { color: var(--co-look-muted); }
.hub-company-sub:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-company-lede {
  margin: 8px 0 0;
  color: var(--co-look-muted);
  font-size: 14px;
  font-weight: 500;
}
.hub-company-fail {
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--co-look-fail);
  font-size: 14px;
}
.hub-company-note {
  margin: 8px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--co-look-ink);
  font-size: 14px;
}
.hub-company-kicker {
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--co-look-muted);
  margin: 32px 0 0;
}
.hub-company-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 0;
  padding: 16px 0;
  border-bottom: 1px solid var(--co-look-line);
  background: none;
  border-radius: 0;
  box-shadow: none;
  min-height: 44px;
  font-size: 14px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  color: var(--co-look-ink);
}
.hub-company-row-label {
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--co-look-ink);
}
.hub-company-row-meta {
  color: var(--co-look-muted);
  font-size: 13px;
}
.hub-company-field {
  flex: 1 1 220px;
  min-width: 0;
}
.hub-company-input,
.hub-company select.hub-company-input {
  width: 100%;
  min-height: 44px;
  height: auto;
  padding: 8px 12px;
  border: 1px solid var(--co-look-line);
  border-radius: 12px;
  background: var(--co-look-sheet);
  color: var(--co-look-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  box-shadow: none;
}
.hub-company-input:focus {
  outline: none;
  border-color: #2E75B6;
}
.hub-company-input-wrap {
  position: relative;
}
.hub-company-input-wrap .hub-company-eye {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--co-look-muted);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.hub-company .company-logo-strip {
  background: none;
  border: none;
  border-radius: 0;
  padding: 16px 0;
  margin: 0;
  border-bottom: 1px solid var(--co-look-line);
  font-family: inherit;
  box-shadow: none;
}
.hub-company .company-logo-strip-title {
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--co-look-muted);
}
.hub-company .company-logo-strip-ctl,
.hub-company .company-logo-strip-clear {
  min-height: 44px;
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
}
.hub-company .company-logo-strip-ctl {
  border: 1px solid var(--co-look-line);
  background: var(--co-look-sheet);
  color: #2E75B6;
}
.hub-company .company-logo-strip-clear {
  color: var(--co-look-muted);
}
.hub-company .company-logo-strip-hint,
.hub-company .company-logo-strip-miss {
  color: var(--co-look-muted);
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-company .company-logo-strip-size {
  color: var(--co-look-muted);
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-company .company-logo-strip-box {
  border-color: #2E75B6;
}
.hub-company-swatch {
  width: 36px;
  height: 36px;
  border: 1px solid var(--co-look-line);
  border-radius: 12px;
  background: var(--co-look-sheet);
  padding: 2px;
  cursor: pointer;
}
.hub-company-add {
  margin-top: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--co-look-line);
}
.hub-company-add-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
}
.hub-company-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 14px;
  color: var(--co-look-ink);
  cursor: pointer;
}
.hub-company-check input {
  width: 16px;
  height: 16px;
  accent-color: #2E75B6;
}
@media (max-width: 639px) {
  .hub-company.ops-page { padding: 16px 16px 40px; }
  .hub-company-sheet-bar { padding: 8px 16px; }
  .hub-company-sheet-bar .hub-company-pill {
    background: #2E75B6;
    color: #fff;
  }
  .hub-company-sheet-body { padding: 24px 16px 16px; }
  .hub-company-hero { font-size: 40px; }
  .hub-company-tools {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .hub-company-next { width: min(100%, 240px); }
}
`;

interface EmailSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
}

interface ReportTheme {
  navy: string;
  accent: string;
  accentLight: string;
  navyLight: string;
}

const defaultEmailSettings: EmailSettings = {
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: false,
  smtp_user: '',
  smtp_pass: '',
  from_name: '',
  from_email: '',
};

const defaultReportTheme: ReportTheme = {
  navy: '#0A2540',
  accent: '#2E75B6',
  accentLight: '#D6E8F7',
  navyLight: '#153558',
};

export function CompanySettingsPage() {
  const { company: authCompany, profile, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const company = companyWithLetterheadLookMark(authCompany, searchParams.get('look')) ?? authCompany;
  const isAdmin = profile?.role === 'admin';

  // Company details
  const [name, setName] = useState(company?.name ?? '');
  const [abn, setAbn] = useState(company?.abn ?? '');
  const [licenceNumber, setLicenceNumber] = useState(company?.licence_number ?? '');
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [email, setEmail] = useState(company?.email ?? '');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [taxRate, setTaxRate] = useState(company?.default_tax_rate?.toString() ?? '10');
  const [materialMarkup, setMaterialMarkup] = useState(company?.default_material_markup?.toString() ?? '0');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? '');
  const [logoCrop, setLogoCrop] = useState<CompanyLogoCrop | null>(() => companyLogoCropFrom(company));
  const [logoSizePx, setLogoSizePx] = useState(() => companyLogoLetterheadSizePx(company));
  const [savingLetterhead, setSavingLetterhead] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<CompanyPaymentMethod[]>(
    () => parseCompanyPaymentMethods((company as { payment_methods?: unknown } | null)?.payment_methods),
  );
  const [savingPay, setSavingPay] = useState(false);
  const [savedPay, setSavedPay] = useState(false);
  const [payError, setPayError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Inspection renderers
  const [renderers, setRenderers] = useState<Array<{ id: string; key: string; label: string; built_in: boolean }>>([]);
  const [showAddRenderer, setShowAddRenderer] = useState(false);
  const [newRendererLabel, setNewRendererLabel] = useState('');
  const [loadingRenderers, setLoadingRenderers] = useState(false);
  const [savingRenderer, setSavingRenderer] = useState(false);

  // Email / SMTP settings
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(defaultEmailSettings);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Report branding / theme
  const existingTheme = (company as { report_theme?: Partial<ReportTheme> | null } | null)?.report_theme;
  const [reportTheme, setReportTheme] = useState<ReportTheme>({
    navy: existingTheme?.navy || defaultReportTheme.navy,
    accent: existingTheme?.accent || defaultReportTheme.accent,
    accentLight: existingTheme?.accentLight || defaultReportTheme.accentLight,
    navyLight: existingTheme?.navyLight || defaultReportTheme.navyLight,
  });
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);
  const [themeError, setThemeError] = useState('');

  // Registered users list (RPC bypasses profiles RLS recursion)
  const { data: registeredUsers, isLoading: loadingUsers, isError: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['registered-users', company?.id],
    queryFn: async () => {
      if (!company) return [];
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: company.id,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        created_at: string;
        email_confirmed_at: string | null;
      }>;
    },
    enabled: !!company && isAdmin,
  });

  useEffect(() => {
    if (company) {
      setLogoUrl(company.logo_url ?? '');
      setLogoCrop(companyLogoCropFrom(company));
      setLogoSizePx(companyLogoLetterheadSizePx(company));
      setPaymentMethods(parseCompanyPaymentMethods((company as { payment_methods?: unknown }).payment_methods));
      loadRenderers();
      if (isAdmin) loadEmailSettings();
      const theme = (company as { report_theme?: Partial<ReportTheme> | null }).report_theme;
      if (theme) {
        setReportTheme({
          navy: theme.navy || defaultReportTheme.navy,
          accent: theme.accent || defaultReportTheme.accent,
          accentLight: theme.accentLight || defaultReportTheme.accentLight,
          navyLight: theme.navyLight || defaultReportTheme.navyLight,
        });
      }
    }
  }, [company]);

  async function handleSaveReportTheme(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSavingTheme(true);
    setThemeError('');
    const { error } = await supabase
      .from('companies')
      .update({ report_theme: reportTheme })
      .eq('id', company.id);
    if (error) {
      setThemeError(error.message);
    } else {
      await refreshProfile();
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2000);
    }
    setSavingTheme(false);
  }

  async function loadRenderers() {
    if (!company) return;
    setLoadingRenderers(true);
    const { data, error } = await supabase
      .from('inspection_renderers')
      .select('*')
      .eq('company_id', company.id)
      .order('built_in', { ascending: false })
      .order('label');
    if (!error && data) setRenderers(data);
    setLoadingRenderers(false);
  }

  async function loadEmailSettings() {
    if (!company) return;
    setLoadingEmail(true);
    const { data } = await supabase
      .from('email_settings')
      .select('*')
      .eq('company_id', company.id)
      .maybeSingle();
    if (data) {
      setEmailSettings({
        smtp_host: data.smtp_host ?? '',
        smtp_port: String(data.smtp_port ?? 587),
        smtp_secure: data.smtp_secure ?? false,
        smtp_user: data.smtp_user ?? '',
        smtp_pass: data.smtp_pass ?? '',
        from_name: data.from_name ?? '',
        from_email: data.from_email ?? '',
      });
    }
    setLoadingEmail(false);
  }

  async function handleSaveEmailSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSavingEmail(true);
    setEmailError('');
    setTestResult(null);

    const payload = { ...emailSettings, smtp_port: parseInt(emailSettings.smtp_port, 10) || 587, company_id: company.id };
    const { error } = await supabase
      .from('email_settings')
      .upsert(payload, { onConflict: 'company_id' });

    if (error) {
      setEmailError(error.message);
    } else {
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2000);
    }
    setSavingEmail(false);
  }

  async function handleTestEmail() {
    if (!company) return;
    setTestingEmail(true);
    setTestResult(null);

    // Call the invite-user function with a test flag by hitting a dedicated test endpoint
    // We'll use the ai-settings function pattern â€” call the edge function with test mode
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-smtp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ companyId: company.id, company_id: company.id }),
        }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setTestResult({ ok: true, message: 'Test email sent successfully. Check your inbox.' });
      } else {
        setTestResult({ ok: false, message: json.error ?? 'Test failed.' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    }
    setTestingEmail(false);
  }

  async function handleAddRenderer(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !newRendererLabel.trim()) return;
    setSavingRenderer(true);
    const key = `custom_${Date.now()}`;
    const { error } = await supabase.from('inspection_renderers').insert({
      company_id: company.id,
      key,
      label: newRendererLabel.trim(),
      built_in: false,
    });
    if (!error) {
      setNewRendererLabel('');
      setShowAddRenderer(false);
      await loadRenderers();
    }
    setSavingRenderer(false);
  }

  async function handleDeleteRenderer(id: string) {
    if (!window.confirm('Delete this inspection type?')) return;
    await supabase.from('inspection_renderers').delete().eq('id', id);
    await loadRenderers();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('companies')
      .update({ name, abn, licence_number: licenceNumber, phone, email, website, default_tax_rate: Number(taxRate), default_material_markup: Number(materialMarkup) || 0 })
      .eq('id', company.id);
    if (error) {
      setError(error.message);
    } else {
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !company) return;
    setLogoError('');
    const decision = decideCompanyLogoUpload({ companyId: company.id, file });
    if (!decision.ok) {
      setLogoError(decision.message);
      return;
    }
    setUploadingLogo(true);
    const result = await persistCompanyLogo(companyLogoClientFromSupabase(supabase), {
      companyId: company.id,
      file,
    });
    if (!result.ok) {
      setLogoError(result.message);
    } else {
      setLogoUrl(`${result.logo_url}?t=${Date.now()}`);
      setLogoCrop(null);
      await persistCompanyLogoLetterhead(companyLogoLetterheadClientFromSupabase(supabase), {
        companyId: company.id,
        crop: null,
        sizePx: logoSizePx,
      });
      await refreshProfile();
    }
    setUploadingLogo(false);
  }

  async function handleLogoRemove() {
    if (!company) return;
    setLogoError('');
    setRemovingLogo(true);
    const result = await removeCompanyLogo(companyLogoClientFromSupabase(supabase), company.id);
    if (!result.ok) {
      setLogoError(result.message);
    } else {
      setLogoUrl('');
      setLogoCrop(null);
      await persistCompanyLogoLetterhead(companyLogoLetterheadClientFromSupabase(supabase), {
        companyId: company.id,
        crop: null,
        sizePx: logoSizePx,
      });
      await refreshProfile();
    }
    setRemovingLogo(false);
  }

  async function handleSaveLogoLetterhead() {
    if (!company) return;
    setLogoError('');
    setSavingLetterhead(true);
    const result = await persistCompanyLogoLetterhead(companyLogoLetterheadClientFromSupabase(supabase), {
      companyId: company.id,
      crop: logoCrop,
      sizePx: logoSizePx,
    });
    if (!result.ok) {
      setLogoError(result.message);
    } else {
      setLogoCrop(result.logo_crop);
      setLogoSizePx(result.logo_letterhead_size ?? logoSizePx);
      await refreshProfile();
    }
    setSavingLetterhead(false);
  }

  async function handleClearLogoCrop() {
    setLogoCrop(null);
    if (!company) return;
    setLogoError('');
    setSavingLetterhead(true);
    const result = await persistCompanyLogoLetterhead(companyLogoLetterheadClientFromSupabase(supabase), {
      companyId: company.id,
      crop: null,
      sizePx: logoSizePx,
    });
    if (!result.ok) setLogoError(result.message);
    else await refreshProfile();
    setSavingLetterhead(false);
  }

  async function handleSavePaymentMethods(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSavingPay(true);
    setPayError('');
    const { error } = await supabase
      .from('companies')
      .update({ payment_methods: companyPaymentMethodsSavePayload(paymentMethods) })
      .eq('id', company.id);
    if (error) {
      setPayError(companyPaymentMethodsSaveError(error.message));
    } else {
      await refreshProfile();
      setSavedPay(true);
      setTimeout(() => setSavedPay(false), 2000);
    }
    setSavingPay(false);
  }

  function patchPaymentMethod(id: string, patch: Partial<CompanyPaymentMethod>) {
    setPaymentMethods(list => list.map(row => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function handleExportCompanyRecords() {
    if (!company) return;
    setExporting(true);
    setExportError('');
    const result = await downloadCompanyExport(companyExportClientFromSupabase(supabase), {
      companyId: company.id,
    });
    if (!result.ok) setExportError(result.message);
    setExporting(false);
  }

  const inputClass = 'hub-company-input';
  const sheetName = company?.name || 'Company';

  return (
    <AppShell>
      <style>{COMPANY_LOOK_CSS}</style>
      <div className="ops-page hub-company">
        <p className="hub-company-label">Settings</p>
        <article className="hub-company-sheet">
          <header className="hub-company-sheet-bar">
            <span className="hub-company-sheet-bar-meta">{sheetName}</span>
            <span className="hub-company-pill">Settings</span>
          </header>
          <div className="hub-company-sheet-body">
        <h1 className="hub-company-hero">{sheetName}</h1>
        <p className="hub-company-jobline">Company profile and branding</p>

        {isAdmin && (
          <>
            <div className="hub-company-tools">
              <button
                type="button"
                onClick={handleExportCompanyRecords}
                disabled={exporting || !company}
                className="hub-company-next"
              >
                <Download size={15} /> {exporting ? 'Preparing...' : 'Download spreadsheet'}
              </button>
            </div>
            <p className="hub-company-lede">
              Download clients, jobs, invoices, and timesheets already in this company.
            </p>
            {exportError ? (
              <p className="hub-company-fail">
                <AlertCircle size={14} /> {exportError}
              </p>
            ) : null}
          </>
        )}

        <p className="hub-company-kicker">Tax & Markup Defaults</p>
        <p className="hub-company-lede">Used as defaults on new quotes, invoices, and purchase orders.</p>
        <div className="hub-company-row">
          <label className="hub-company-row-label">Default Tax Rate</label>
          <div className="hub-company-field" style={{ maxWidth: 160 }}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
                className={inputClass}
              />
              <span className="hub-company-row-meta">%</span>
            </div>
          </div>
        </div>
        <div className="hub-company-row">
          <label className="hub-company-row-label">Default Material Markup</label>
          <div className="hub-company-field" style={{ maxWidth: 240 }}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                value={materialMarkup}
                onChange={e => setMaterialMarkup(e.target.value)}
                className={inputClass}
              />
              <span className="hub-company-row-meta">%</span>
            </div>
            <p className="hub-company-row-meta">Applied to stock cost when adding materials to quotes/invoices.</p>
          </div>
        </div>

        {/* Logo — existing company settings strip only. Not a branding page. */}
        <div className="company-logo-strip">
          <h2 className="company-logo-strip-title">Company Logo</h2>
          <div className="company-logo-strip-row">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="company-logo-strip-mark" />
            ) : (
              <p className="company-logo-strip-miss">No logo yet</p>
            )}
            <label className="company-logo-strip-ctl">
              <Upload size={14} /> {uploadingLogo ? 'Uploading...' : logoUrl ? 'Replace' : 'Add a logo'}
              <input
                type="file"
                accept={COMPANY_LOGO_ACCEPT}
                onChange={handleLogoUpload}
                disabled={uploadingLogo || removingLogo}
                className="sr-only"
              />
            </label>
            {logoUrl ? (
              <button
                type="button"
                onClick={handleLogoRemove}
                disabled={uploadingLogo || removingLogo}
                className="company-logo-strip-clear"
              >
                {removingLogo ? 'Removing...' : 'Clear'}
              </button>
            ) : null}
          </div>
          <p className="company-logo-strip-hint">Your company mark on invoices, quotes, and reports.</p>
          {logoUrl ? (
            <CompanyLogoStripCrop
              src={logoUrl}
              crop={logoCrop}
              sizePx={logoSizePx}
              saving={savingLetterhead}
              onCropChange={setLogoCrop}
              onSizeChange={setLogoSizePx}
              onSave={() => void handleSaveLogoLetterhead()}
              onClearCrop={() => void handleClearLogoCrop()}
            />
          ) : null}
          {logoError ? (
            <p className="company-logo-strip-err">
              <AlertCircle size={14} /> {logoError}
            </p>
          ) : null}
        </div>

        {/* Report branding / theme — admin only */}
        {isAdmin && (
          <form onSubmit={handleSaveReportTheme}>
            <p className="hub-company-kicker">
              <Palette size={14} className="inline mr-2" />
              Report branding / theme
            </p>
            <p className="hub-company-lede">
              Applies to inspection PDF letterhead accents (navy bars, accent highlights).
            </p>
            {(
              [
                { key: 'navy', label: 'Navy' },
                { key: 'accent', label: 'Accent' },
                { key: 'accentLight', label: 'Accent light' },
                { key: 'navyLight', label: 'Navy light' },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="hub-company-row">
                <label className="hub-company-row-label">{label}</label>
                <div className="hub-company-field flex items-center gap-2">
                  <input
                    type="color"
                    value={reportTheme[key]}
                    onChange={e => setReportTheme(prev => ({ ...prev, [key]: e.target.value }))}
                    className="hub-company-swatch"
                  />
                  <input
                    type="text"
                    value={reportTheme[key]}
                    onChange={e => setReportTheme(prev => ({ ...prev, [key]: e.target.value }))}
                    className={inputClass + ' font-mono'}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    placeholder="#000000"
                  />
                </div>
              </div>
            ))}
            {themeError && (
              <p className="hub-company-fail">
                <AlertCircle size={14} /> {themeError}
              </p>
            )}
            <button
              type="submit"
              disabled={savingTheme}
              className="hub-company-sub"
            >
              {themeSaved ? <><Check size={14} /> Saved</> : savingTheme ? 'Saving...' : 'Save theme'}
            </button>
          </form>
        )}

        {/* Inspection Types */}
        <p className="hub-company-kicker">Inspection Types</p>
        {!showAddRenderer && (
          <button
            onClick={() => setShowAddRenderer(true)}
            className="hub-company-sub"
          >
            <Plus size={14} /> Add Type
          </button>
        )}

        {showAddRenderer && (
          <form onSubmit={handleAddRenderer} className="hub-company-add">
            <input
              type="text"
              value={newRendererLabel}
              onChange={e => setNewRendererLabel(e.target.value)}
              placeholder="e.g. Roof Inspection, HVAC Check"
              className={inputClass}
              autoFocus
            />
            <div className="hub-company-add-acts">
              <button
                type="submit"
                disabled={savingRenderer}
                className="hub-company-sub"
              >
                {savingRenderer ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddRenderer(false)}
                className="hub-company-sub is-quiet"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loadingRenderers ? (
          <p className="hub-company-lede">Loading...</p>
        ) : renderers.length === 0 ? (
          <p className="hub-company-lede">No custom inspection types yet.</p>
        ) : (
          renderers.map(renderer => (
            <div key={renderer.id} className="hub-company-row">
              <div>
                <p className="hub-company-row-label">{renderer.label}</p>
                {renderer.built_in && <p className="hub-company-row-meta">Built-in</p>}
              </div>
              {!renderer.built_in && (
                <button
                  onClick={() => handleDeleteRenderer(renderer.id)}
                  className="hub-company-sub is-quiet"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}

        {/* Email / SMTP Settings — admin only */}
        {isAdmin && (
          <>
            <p className="hub-company-kicker">
              <Mail size={14} className="inline mr-2" />
              Email Settings
            </p>
            <p className="hub-company-lede">
              Configure a custom SMTP server so invitation emails are sent reliably from your own address.
              If left empty, the system will attempt to use the default email provider.
            </p>

            {loadingEmail ? (
              <p className="hub-company-lede">Loading...</p>
            ) : (
              <form onSubmit={handleSaveEmailSettings}>
                <div className="hub-company-row">
                  <label className="hub-company-row-label">From Name</label>
                  <div className="hub-company-field">
                    <input
                      value={emailSettings.from_name}
                      onChange={e => setEmailSettings(s => ({ ...s, from_name: e.target.value }))}
                      placeholder="Grafter"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="hub-company-row">
                  <label className="hub-company-row-label">From Email</label>
                  <div className="hub-company-field">
                    <input
                      type="email"
                      value={emailSettings.from_email}
                      onChange={e => setEmailSettings(s => ({ ...s, from_email: e.target.value }))}
                      placeholder="noreply@yourcompany.com"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="hub-company-kicker">SMTP Server</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="col-span-1 sm:col-span-2 hub-company-row">
                    <label className="hub-company-row-label">SMTP Host</label>
                    <div className="hub-company-field">
                      <input
                        value={emailSettings.smtp_host}
                        onChange={e => setEmailSettings(s => ({ ...s, smtp_host: e.target.value }))}
                        placeholder="smtp.resend.com"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">Port</label>
                    <div className="hub-company-field">
                      <input
                        type="number"
                        value={emailSettings.smtp_port}
                        onChange={e => setEmailSettings(s => ({ ...s, smtp_port: e.target.value }))}
                        className={inputClass}
                        placeholder="587"
                      />
                    </div>
                  </div>
                </div>
                <div className="hub-company-row">
                  <label className="hub-company-row-label">SMTP Username</label>
                  <div className="hub-company-field">
                    <input
                      value={emailSettings.smtp_user}
                      onChange={e => setEmailSettings(s => ({ ...s, smtp_user: e.target.value }))}
                      placeholder="apikey"
                      autoComplete="off"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="hub-company-row">
                  <label className="hub-company-row-label">SMTP Password / API Key</label>
                  <div className="hub-company-field hub-company-input-wrap">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={emailSettings.smtp_pass}
                      onChange={e => setEmailSettings(s => ({ ...s, smtp_pass: e.target.value }))}
                      placeholder="API key"
                      autoComplete="new-password"
                      className={inputClass + ' pr-12'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="hub-company-eye"
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <label className="hub-company-check">
                  <input
                    type="checkbox"
                    checked={emailSettings.smtp_secure}
                    onChange={e => setEmailSettings(s => ({ ...s, smtp_secure: e.target.checked }))}
                  />
                  Use TLS/SSL (port 465)
                </label>

                {emailError && (
                  <p className="hub-company-fail">
                    <AlertCircle size={14} /> {emailError}
                  </p>
                )}

                {testResult && (
                  <div className={testResult.ok ? 'hub-company-note' : 'hub-company-fail'}>
                    {testResult.ok
                      ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                      : <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    }
                    {testResult.message}
                  </div>
                )}

                <div className="hub-company-add-acts">
                  <button
                    type="submit"
                    disabled={savingEmail}
                    className="hub-company-sub"
                  >
                    {emailSaved ? <><Check size={15} /> Saved</> : savingEmail ? 'Saving...' : 'Save Email Settings'}
                  </button>
                  {emailSettings.smtp_host && emailSettings.smtp_user && emailSettings.smtp_pass && (
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={testingEmail}
                      className="hub-company-sub is-quiet"
                    >
                      {testingEmail ? 'Sending...' : 'Send Test Email'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}

        {/* Registered Users — admin only */}
        {isAdmin && (
          <>
            <p className="hub-company-kicker">
              <Users size={14} className="inline mr-2" />
              Registered Users
            </p>
            <Link
              to="/settings/team"
              className="hub-company-sub"
            >
              Manage team →
            </Link>

            {loadingUsers ? (
              <p className="hub-company-lede">Loading users...</p>
            ) : usersError && !isDevFieldAuditAuth() ? (
              <div className="hub-company-fail">
                Could not load registered users.{' '}
                <button type="button" onClick={() => refetchUsers()} className="hub-company-sub">
                  Retry
                </button>
              </div>
            ) : registeredUsers && registeredUsers.length === 0 ? (
              <p className="hub-company-lede">No users registered yet.</p>
            ) : (
              registeredUsers?.map(user => (
                <div key={user.id} className="hub-company-row">
                  <div>
                    <p className="hub-company-row-label">{user.name || '—'}</p>
                    <p className="hub-company-row-meta">{user.email}</p>
                  </div>
                  <div className="hub-company-row-meta">
                    <span className="capitalize">{user.role || 'member'}</span>
                    {' · '}
                    {user.email_confirmed_at ? 'Active' : 'Pending'}
                    {user.created_at ? ` · ${new Date(user.created_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Company details */}
        <p className="hub-company-kicker">Company Details</p>
        <form onSubmit={handleSave}>
          <div className="hub-company-row">
            <label className="hub-company-row-label">Company Name</label>
            <div className="hub-company-field">
              <input value={name} onChange={e => setName(e.target.value)} required className={inputClass} />
            </div>
          </div>
          <div className="hub-company-row">
            <label className="hub-company-row-label">ABN</label>
            <div className="hub-company-field">
              <input value={abn} onChange={e => setAbn(e.target.value)}
                className={inputClass + ' font-mono'} placeholder="00 000 000 000" />
            </div>
          </div>
          <div className="hub-company-row">
            <label className="hub-company-row-label">Licence Number</label>
            <div className="hub-company-field">
              <input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)}
                className={inputClass + ' font-mono'} placeholder="EL-12345" />
            </div>
          </div>
          <div className="hub-company-row">
            <label className="hub-company-row-label">Phone</label>
            <div className="hub-company-field">
              <input value={phone} onChange={e => setPhone(e.target.value)}
                className={inputClass} placeholder="0400 000 000" />
            </div>
          </div>
          <div className="hub-company-row">
            <label className="hub-company-row-label">Email</label>
            <div className="hub-company-field">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputClass} placeholder="info@company.com.au" />
            </div>
          </div>
          <div className="hub-company-row">
            <label className="hub-company-row-label">Website</label>
            <div className="hub-company-field">
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                className={inputClass} placeholder="www.company.com.au" />
            </div>
          </div>

          {error && <p className="hub-company-fail">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="hub-company-sub"
          >
            {saved ? <><Check size={15} /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        <p className="hub-company-kicker">How clients pay</p>
        <p className="hub-company-lede">Printed on invoices as the way to pay. Leave empty if you do not want bank details on the invoice.</p>
        <form onSubmit={handleSavePaymentMethods}>
          {paymentMethods.map(method => (
            <div key={method.id}>
              <div className="hub-company-row">
                <select
                  value={method.kind}
                  onChange={e => {
                    const kind = e.target.value as CompanyPaymentKind;
                    patchPaymentMethod(method.id, {
                      kind,
                      label: COMPANY_PAYMENT_KIND_LABEL[kind],
                    });
                  }}
                  className={inputClass}
                  style={{ maxWidth: 180 }}
                  aria-label="Payment method type"
                >
                  <option value="bank_transfer">{COMPANY_PAYMENT_KIND_LABEL.bank_transfer}</option>
                  <option value="payid">{COMPANY_PAYMENT_KIND_LABEL.payid}</option>
                  <option value="other">{COMPANY_PAYMENT_KIND_LABEL.other}</option>
                </select>
                <input
                  value={method.label}
                  onChange={e => patchPaymentMethod(method.id, { label: e.target.value })}
                  className={inputClass}
                  placeholder="Label on the invoice"
                  aria-label="Payment method label"
                />
                <button
                  type="button"
                  onClick={() => setPaymentMethods(list => list.filter(row => row.id !== method.id))}
                  className="hub-company-sub is-quiet"
                  aria-label="Remove payment method"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {method.kind === 'bank_transfer' ? (
                <>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">Account name</label>
                    <div className="hub-company-field">
                      <input value={method.account_name} onChange={e => patchPaymentMethod(method.id, { account_name: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">BSB</label>
                    <div className="hub-company-field">
                      <input value={method.bsb} onChange={e => patchPaymentMethod(method.id, { bsb: e.target.value })} className={inputClass + ' font-mono'} />
                    </div>
                  </div>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">Account number</label>
                    <div className="hub-company-field">
                      <input value={method.account_number} onChange={e => patchPaymentMethod(method.id, { account_number: e.target.value })} className={inputClass + ' font-mono'} />
                    </div>
                  </div>
                </>
              ) : null}
              {method.kind === 'payid' ? (
                <>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">PayID</label>
                    <div className="hub-company-field">
                      <input value={method.payid} onChange={e => patchPaymentMethod(method.id, { payid: e.target.value })} className={inputClass} placeholder="email, phone, or ABN" />
                    </div>
                  </div>
                  <div className="hub-company-row">
                    <label className="hub-company-row-label">Account name</label>
                    <div className="hub-company-field">
                      <input value={method.account_name} onChange={e => patchPaymentMethod(method.id, { account_name: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="hub-company-row">
                <label className="hub-company-row-label">Notes on the invoice</label>
                <div className="hub-company-field">
                  <input
                    value={method.notes}
                    onChange={e => patchPaymentMethod(method.id, { notes: e.target.value })}
                    className={inputClass}
                    placeholder="Use the invoice number as the reference"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPaymentMethods(list => [...list, blankCompanyPaymentMethod('bank_transfer')])}
            className="hub-company-sub"
          >
            <Plus size={15} /> Add a payment method
          </button>
          {payError ? <p className="hub-company-fail">{payError}</p> : null}
          <button
            type="submit"
            disabled={savingPay}
            className="hub-company-sub"
          >
            {savedPay ? <><Check size={15} /> Saved</> : savingPay ? 'Saving...' : 'Save payment methods'}
          </button>
        </form>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
