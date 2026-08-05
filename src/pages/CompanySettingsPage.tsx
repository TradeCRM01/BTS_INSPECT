import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/layout/AppShell';
import { Check, Upload, Plus, Trash2, Mail, Eye, EyeOff, AlertCircle, CheckCircle2, Users, Trash } from 'lucide-react';

interface EmailSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
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

export function CompanySettingsPage() {
  const { company, profile, refreshProfile } = useAuth();
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
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? '');

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

  // Registered users list
  const { data: registeredUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['registered-users', company?.id],
    queryFn: async () => {
      if (!company) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, email, name, created_at')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!company && isAdmin,
  });

  useEffect(() => {
    if (company) {
      loadRenderers();
      if (isAdmin) loadEmailSettings();
    }
  }, [company]);

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
    // We'll use the ai-settings function pattern — call the edge function with test mode
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
          body: JSON.stringify({ company_id: company.id }),
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
    if (!file || !company) return;
    setUploadingLogo(true);
    const path = `${company.id}/logo.png`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type, upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(path);
      const newUrl = data.publicUrl + `?t=${Date.now()}`;
      setLogoUrl(newUrl);
      await supabase.from('companies').update({ logo_url: data.publicUrl }).eq('id', company.id);
    }
    setUploadingLogo(false);
    e.target.value = '';
  }

  const inputClass = 'w-full px-3 py-2.5 border border-[#E5E7EB] rounded-md text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent text-sm';

  return (
    <AppShell>
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold text-[#1A1A1A] mb-1">Company Settings</h1>
        <p className="text-sm text-[#4A5568] mb-6">Manage your company profile and branding.</p>

        {/* Default Tax Rate */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-1">Tax & Markup Defaults</h2>
          <p className="text-xs text-[#4A5568] mb-3">Used as defaults on new quotes, invoices, and purchase orders.</p>
          <div className="flex items-center gap-6">
            <div>
              <label className="text-xs text-[#4A5568] block mb-1">Default Tax Rate</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                  className={inputClass + ' max-w-[120px]'}
                />
                <span className="text-sm text-[#4A5568]">%</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#4A5568] block mb-1">Default Material Markup</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={materialMarkup}
                  onChange={e => setMaterialMarkup(e.target.value)}
                  className={inputClass + ' max-w-[120px]'}
                />
                <span className="text-sm text-[#4A5568]">%</span>
              </div>
              <p className="text-[10px] text-[#9CA3AF] mt-1">Applied to stock cost when adding materials to quotes/invoices.</p>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Company Logo</h2>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="h-12 object-contain border border-[#E5E7EB] rounded p-1" />
            ) : (
              <div className="w-20 h-12 border-2 border-dashed border-[#E5E7EB] rounded flex items-center justify-center">
                <span className="text-xs text-[#4A5568]">No logo</span>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-sm border border-[#E5E7EB] text-[#4A5568] px-3 py-2 rounded cursor-pointer hover:bg-[#F9FAFB]">
              <Upload size={14} /> {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="sr-only" />
            </label>
          </div>
          <p className="text-xs text-[#4A5568] mt-2">PNG or SVG recommended. Used on PDF reports.</p>
        </div>

        {/* Inspection Types */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Inspection Types</h2>
            {!showAddRenderer && (
              <button
                onClick={() => setShowAddRenderer(true)}
                className="flex items-center gap-1.5 text-xs bg-[#0A2540] text-white px-2.5 py-1.5 rounded hover:bg-[#0d2f4e]"
              >
                <Plus size={14} /> Add Type
              </button>
            )}
          </div>

          {showAddRenderer && (
            <form onSubmit={handleAddRenderer} className="mb-4 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded">
              <input
                type="text"
                value={newRendererLabel}
                onChange={e => setNewRendererLabel(e.target.value)}
                placeholder="e.g. Roof Inspection, HVAC Check"
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingRenderer}
                  className="text-xs bg-[#0A2540] text-white px-3 py-1.5 rounded hover:bg-[#0d2f4e] disabled:opacity-50"
                >
                  {savingRenderer ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddRenderer(false)}
                  className="text-xs border border-[#E5E7EB] text-[#4A5568] px-3 py-1.5 rounded hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {loadingRenderers ? (
              <p className="text-xs text-[#4A5568]">Loading...</p>
            ) : renderers.length === 0 ? (
              <p className="text-xs text-[#4A5568]">No custom inspection types yet.</p>
            ) : (
              renderers.map(renderer => (
                <div key={renderer.id} className="flex items-center justify-between p-2.5 bg-[#F9FAFB] rounded border border-[#E5E7EB]">
                  <div>
                    <p className="text-sm text-[#1A1A1A] font-medium">{renderer.label}</p>
                    {renderer.built_in && <p className="text-xs text-[#4A5568]">Built-in</p>}
                  </div>
                  {!renderer.built_in && (
                    <button
                      onClick={() => handleDeleteRenderer(renderer.id)}
                      className="text-[#4A5568] hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Email / SMTP Settings — admin only */}
        {isAdmin && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} className="text-[#2E75B6]" />
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Email Settings</h2>
            </div>
            <p className="text-xs text-[#4A5568] mb-4">
              Configure a custom SMTP server so invitation emails are sent reliably from your own address.
              If left empty, the system will attempt to use the default email provider.
            </p>

            {loadingEmail ? (
              <p className="text-xs text-[#4A5568]">Loading...</p>
            ) : (
              <form onSubmit={handleSaveEmailSettings} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">From Name</label>
                    <input
                      value={emailSettings.from_name}
                      onChange={e => setEmailSettings(s => ({ ...s, from_name: e.target.value }))}
                      placeholder="BTS Inspect"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">From Email</label>
                    <input
                      type="email"
                      value={emailSettings.from_email}
                      onChange={e => setEmailSettings(s => ({ ...s, from_email: e.target.value }))}
                      placeholder="noreply@yourcompany.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="border-t border-[#E5E7EB] pt-4">
                  <p className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide mb-3">SMTP Server</p>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Host</label>
                      <input
                        value={emailSettings.smtp_host}
                        onChange={e => setEmailSettings(s => ({ ...s, smtp_host: e.target.value }))}
                        placeholder="smtp.resend.com"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Port</label>
                      <input
                        type="number"
                        value={emailSettings.smtp_port}
                        onChange={e => setEmailSettings(s => ({ ...s, smtp_port: e.target.value }))}
                        className={inputClass}
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Username</label>
                      <input
                        value={emailSettings.smtp_user}
                        onChange={e => setEmailSettings(s => ({ ...s, smtp_user: e.target.value }))}
                        placeholder="apikey"
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">SMTP Password / API Key</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={emailSettings.smtp_pass}
                          onChange={e => setEmailSettings(s => ({ ...s, smtp_pass: e.target.value }))}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          className={inputClass + ' pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(v => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#1A1A1A]"
                        >
                          {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-[#1A1A1A] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={emailSettings.smtp_secure}
                      onChange={e => setEmailSettings(s => ({ ...s, smtp_secure: e.target.checked }))}
                      className="w-4 h-4 accent-[#2E75B6]"
                    />
                    Use TLS/SSL (port 465)
                  </label>
                </div>

                {emailError && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {emailError}
                  </p>
                )}

                {testResult && (
                  <div className={`flex items-start gap-2 text-sm p-3 rounded-md border ${testResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {testResult.ok
                      ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                      : <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    }
                    {testResult.message}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingEmail}
                    className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
                  >
                    {emailSaved ? <><Check size={15} /> Saved</> : savingEmail ? 'Saving...' : 'Save Email Settings'}
                  </button>
                  {emailSettings.smtp_host && emailSettings.smtp_user && emailSettings.smtp_pass && (
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={testingEmail}
                      className="flex items-center gap-2 border border-[#E5E7EB] text-[#4A5568] px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#F9FAFB] disabled:opacity-50"
                    >
                      {testingEmail ? 'Sending...' : 'Send Test Email'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* Registered Users — admin only */}
        {isAdmin && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-[#2E75B6]" />
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Registered Users</h2>
            </div>

            {loadingUsers ? (
              <p className="text-xs text-[#4A5568]">Loading users...</p>
            ) : registeredUsers && registeredUsers.length === 0 ? (
              <p className="text-xs text-[#4A5568]">No users registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]">Name</th>
                      <th className="text-left py-2 px-3 font-medium text-[#1A1A1A]">Email</th>
                      <th className="text-left py-2 px-3 font-medium text-[#1A1A1A] hidden sm:table-cell">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-[#1A1A1A] hidden md:table-cell">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredUsers?.map(user => (
                      <tr key={user.id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB]">
                        <td className="py-2.5 px-3 text-[#1A1A1A]">{user.name || '—'}</td>
                        <td className="py-2.5 px-3 text-[#4A5568]">{user.email}</td>
                        <td className="py-2.5 px-3 hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full border border-green-200">
                            <Check size={12} /> Active
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#9CA3AF] hidden md:table-cell text-xs">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Company details */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Company Details</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Company Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">ABN</label>
                <input value={abn} onChange={e => setAbn(e.target.value)}
                  className={inputClass + ' font-mono'} placeholder="00 000 000 000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Licence Number</label>
                <input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)}
                  className={inputClass + ' font-mono'} placeholder="EL-12345" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                className={inputClass} placeholder="0400 000 000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputClass} placeholder="info@company.com.au" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Website</label>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                className={inputClass} placeholder="www.company.com.au" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
            >
              {saved ? <><Check size={15} /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
