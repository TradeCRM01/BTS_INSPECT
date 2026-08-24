import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../contexts/AuthContext';
import { StorageAnalytics } from '../components/admin/StorageAnalytics';
import {
  Key, Check, AlertCircle, Eye, EyeOff, Cpu, Wrench,
  CheckCircle2, XCircle, Loader2, Save,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const MODELS = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', description: 'Most capable â€” best for complex analysis and admin console' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Balanced speed and capability' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fastest â€” best for simple Q&A and the help assistant' },
];

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

async function callAiSettings(method: 'GET' | 'POST', body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-settings`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function AiSettingsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [keySet, setKeySet] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-7');
  const [adminToolsEnabled, setAdminToolsEnabled] = useState(true);

  // Key input state
  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    callAiSettings('GET').then(data => {
      setKeySet(data.keySet ?? false);
      setMaskedKey(data.maskedKey ?? '');
      setModel(data.model ?? 'claude-opus-4-7');
      setAdminToolsEnabled(data.adminToolsEnabled ?? true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function handleTestKey() {
    const key = newKey.trim();
    if (!key) return;
    setTestState('testing');
    setTestError('');
    try {
      const res = await callAiSettings('POST', { anthropic_api_key: key, model, test_only: true });
      if (res.ok) {
        setTestState('ok');
      } else {
        setTestState('fail');
        setTestError(res.error ?? 'Key validation failed');
      }
    } catch {
      setTestState('fail');
      setTestError('Network error â€” could not reach the validation service');
    }
  }

  async function handleSaveKey() {
    const key = newKey.trim();
    if (!key) return;
    setSaving(true);
    setSaveError('');
    const res = await callAiSettings('POST', { anthropic_api_key: key });
    if (res.ok) {
      setKeySet(true);
      setMaskedKey(`sk-ant-${'â€¢'.repeat(20)}${key.slice(-4)}`);
      setEditingKey(false);
      setNewKey('');
      setTestState('idle');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setSaveError(res.error ?? 'Failed to save key');
    }
    setSaving(false);
  }

  async function handleSaveSettings() {
    setSaving(true);
    setSaveError('');
    const res = await callAiSettings('POST', { model, admin_tools_enabled: adminToolsEnabled });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setSaveError(res.error ?? 'Failed to save settings');
    }
    setSaving(false);
  }

  return (
    <AppShell>
      <div className="page-shell-narrow">
        <h1 className="text-xl font-semibold text-[#1A1A1A] mb-1">AI Settings</h1>
        <p className="text-sm text-[#4A5568] mb-6">
          Configure the AI engine used by the AI Console and Help Assistant.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#4A5568]" />
          </div>
        ) : (
          <div className="space-y-4">

            {/* API Key */}
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <Key size={16} className="text-[#2E75B6]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Anthropic API Key</h2>
              </div>
              <p className="text-xs text-[#4A5568] mb-4">
                Required for both the AI Console and AI Help Assistant.
                Get your key at{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                  className="text-[#2E75B6] hover:underline">
                  console.anthropic.com
                </a>.
              </p>

              {!editingKey ? (
                <div className="flex items-center justify-between p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md">
                  <div className="flex items-center gap-2">
                    {keySet ? (
                      <>
                        <CheckCircle2 size={15} className="text-green-600 shrink-0" />
                        <span className="text-sm font-mono text-[#1A1A1A]">{maskedKey}</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={15} className="text-red-500 shrink-0" />
                        <span className="text-sm text-[#4A5568]">No API key configured</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditingKey(true); setTestState('idle'); setTestError(''); }}
                    className="text-xs text-[#2E75B6] hover:underline font-medium"
                  >
                    {keySet ? 'Replace' : 'Add key'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={newKey}
                      onChange={e => { setNewKey(e.target.value); setTestState('idle'); setTestError(''); }}
                      placeholder="sk-ant-api03-..."
                      autoFocus
                      className="w-full px-3 py-2.5 pr-12 border border-[#E5E7EB] rounded-md text-sm font-mono text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4A5568]"
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {/* Test result */}
                  {testState === 'ok' && (
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                      <CheckCircle2 size={13} /> Key is valid and working.
                    </div>
                  )}
                  {testState === 'fail' && (
                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>{testError || 'Key validation failed. Check the key and try again.'}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestKey}
                      disabled={!newKey.trim() || testState === 'testing'}
                      className="flex items-center gap-1.5 text-xs border border-[#E5E7EB] text-[#4A5568] px-3 py-2 rounded hover:bg-[#F9FAFB] disabled:opacity-50"
                    >
                      {testState === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      {testState === 'testing' ? 'Testing...' : 'Test key'}
                    </button>
                    <button
                      onClick={handleSaveKey}
                      disabled={!newKey.trim() || saving || testState === 'fail'}
                      className="flex items-center gap-1.5 text-xs bg-[#0A2540] text-white px-3 py-2 rounded hover:bg-[#0d2f4e] disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {saving ? 'Saving...' : 'Save key'}
                    </button>
                    <button
                      onClick={() => { setEditingKey(false); setNewKey(''); setTestState('idle'); setTestError(''); }}
                      className="text-xs text-[#4A5568] hover:text-[#1A1A1A] px-2 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                  {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                </div>
              )}
            </div>

            {/* Model */}
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={16} className="text-[#2E75B6]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Model</h2>
              </div>
              <p className="text-xs text-[#4A5568] mb-4">
                Choose the Claude model used for both the AI Console and AI Help Assistant.
              </p>
              <div className="space-y-2">
                {MODELS.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      model === m.id
                        ? 'border-[#2E75B6] bg-blue-50/50'
                        : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={model === m.id}
                      onChange={() => setModel(m.id)}
                      className="mt-0.5 accent-[#2E75B6]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">{m.label}</p>
                      <p className="text-xs text-[#4A5568]">{m.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Admin Tools */}
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <Wrench size={16} className="text-[#2E75B6]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Admin Console Tools</h2>
              </div>
              <p className="text-xs text-[#4A5568] mb-4">
                Allow the AI Console to query and modify the database directly. Disable this
                to restrict the console to read-only responses.
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setAdminToolsEnabled(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    adminToolsEnabled ? 'bg-[#2E75B6]' : 'bg-[#D1D5DB]'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    adminToolsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-sm text-[#1A1A1A]">
                  {adminToolsEnabled ? 'Enabled â€” AI can query and modify data' : 'Disabled â€” AI Console is read-only'}
                </span>
              </label>
            </div>

            {/* Save settings */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50 transition-colors"
              >
                {saved ? (
                  <><Check size={15} /> Saved</>
                ) : saving ? (
                  <><Loader2 size={15} className="animate-spin" /> Saving...</>
                ) : (
                  'Save Settings'
                )}
              </button>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>

            {/* Storage Analytics */}
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
              <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Storage Analytics</h2>
              <StorageAnalytics />
            </div>

          </div>
        )}
      </div>
    </AppShell>
  );
}
