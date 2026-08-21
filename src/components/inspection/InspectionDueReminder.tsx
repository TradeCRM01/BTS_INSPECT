import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MoreHorizontal, Phone, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui';
import {
  decideInspectionDueSend,
  inspectionDueHref,
  prefillReminderTo,
  prefillSmsTo,
  resolveInspectionClientId,
  type DueInspection,
  type DueInspectionJob,
} from '../../lib/inspectionDueReminder';
import { missSmsMessage, type ReminderClient, type ReminderEmailSettings } from '../../lib/jobReminder';
import {
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  attachJobClient,
  companyClientsForAttach,
  jobClientAttachRow,
  jobClientAttachToast,
} from '../../lib/attachJobClient';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  jobClientEmailRow,
  jobClientEmailSaveToast,
  saveJobClientEmail,
} from '../../lib/saveJobClientEmail';
import {
  JOB_CLIENT_PHONE_NO_CLIENT,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  saveJobClientPhone,
} from '../../lib/saveJobClientPhone';

/** Honest no_email miss on this tray — write the address below. Not a failed-send line. */
export const DUE_REMINDER_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

/** Honest no_phone miss on this tray — write the number on SMS To. Not a failed-send line. */
export const DUE_REMINDER_NO_PHONE_FIELD =
  'This client has no phone. Add one below before you send.';

/** Honest no-client miss on this tray — pick an existing client below. Not a failed-send line. */
export const DUE_REMINDER_NO_CLIENT_FIELD =
  'This job has no client. Add one below before you send.';

export function InspectionDueReminder({
  inspection,
  job,
  client,
  company,
}: {
  inspection: DueInspection;
  job: DueInspectionJob | null;
  client: ReminderClient | null;
  company: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [clientEmailDraft, setClientEmailDraft] = useState(client?.email ?? '');
  const [emailOverride, setEmailOverride] = useState<string | null | undefined>(undefined);
  const [clientPhoneDraft, setClientPhoneDraft] = useState(client?.phone ?? '');
  const [phoneOverride, setPhoneOverride] = useState<string | null | undefined>(undefined);
  const liveClient = client
    ? {
        ...client,
        email: emailOverride !== undefined ? emailOverride : client.email,
        phone: phoneOverride !== undefined ? phoneOverride : client.phone,
      }
    : client;
  const resolvedClientId = resolveInspectionClientId(inspection, job);
  const emailRow = jobClientEmailRow({
    clientId: resolvedClientId,
    client: liveClient
      ? { id: liveClient.id, email: liveClient.email ?? null }
      : null,
  });
  const phoneRow = jobClientPhoneRow({
    clientId: resolvedClientId,
    client: liveClient
      ? { id: liveClient.id, phone: liveClient.phone ?? null }
      : null,
  });
  const to = prefillReminderTo(liveClient);
  const smsTo = prefillSmsTo(liveClient?.phone);
  const companyId = company?.id ?? job?.company_id ?? '';
  const noClientMiss = !resolvedClientId;
  const canAttachOnJob = noClientMiss && !!job?.id;

  const attachClientsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['due-attach-clients', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('archived', false)
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: canAttachOnJob && !!companyId,
  });
  const attachRow = jobClientAttachRow({
    jobClientId: resolvedClientId,
    companyClients: resolvedClientId || !job?.id
      ? []
      : attachClientsQuery.isFetched
        ? companyClientsForAttach(attachClientsQuery.data ?? [])
        : null,
  });
  const noClientsNamedMiss = canAttachOnJob && attachRow.kind === 'miss';

  const { data: settings, isFetched: settingsFetched } = useQuery<ReminderEmailSettings | null>({
    queryKey: ['email-settings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('smtp_host, smtp_pass, from_name, from_email')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as ReminderEmailSettings) ?? null;
    },
    enabled: !!companyId,
  });

  const decision = decideInspectionDueSend({
    inspection,
    job,
    client: liveClient,
    settings: settings ?? null,
    company: company ?? {},
    companyId,
    appUrl: typeof window !== 'undefined' ? window.location.origin : '',
    mode: 'manual',
  });
  const awaitingSmtp = !settingsFetched && !!companyId;
  const noEmailFieldMiss =
    !awaitingSmtp
    && !decision.send
    && decision.reason === 'no_email'
    && emailRow.kind === 'edit';
  const noPhoneFieldMiss =
    !awaitingSmtp
    && decision.send
    && !smsTo
    && phoneRow.kind === 'edit';
  const noClientFieldMiss =
    !awaitingSmtp
    && canAttachOnJob
    && attachRow.kind !== 'miss'
    && !decision.send
    && decision.reason === 'no_email';
  const missText = noEmailFieldMiss
    ? DUE_REMINDER_NO_EMAIL_FIELD
    : noClientFieldMiss
      ? DUE_REMINDER_NO_CLIENT_FIELD
      : (noClientsNamedMiss && !decision.send && decision.reason === 'no_email')
        ? JOB_CLIENT_ATTACH_NO_CLIENTS
        : (!decision.send ? decision.message : '');

  useEffect(() => {
    setClientAttachDraft('');
    setEmailOverride(undefined);
    setClientEmailDraft(client?.email ?? '');
    setPhoneOverride(undefined);
    setClientPhoneDraft(client?.phone ?? '');
  }, [inspection.id, job?.id, job?.client_id, client?.id, client?.email, client?.phone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#inspection-due') return;
    document.getElementById('inspection-due')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [inspection.id]);

  const attachClient = useMutation({
    mutationFn: async () => {
      return attachJobClient({
        jobId: job?.id,
        jobClientId: job?.client_id ?? resolvedClientId,
        clientId: clientAttachDraft,
        companyClients: attachClientsQuery.data ?? [],
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobs-for-inspection-fill'] });
      queryClient.invalidateQueries({ queryKey: ['job', result.jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['inspection-due-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['inspection', inspection.id] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['job-inspections'] });
      setClientAttachDraft('');
      const toast = jobClientAttachToast();
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const saveEmail = useMutation({
    mutationFn: async () => {
      if (emailRow.kind !== 'edit') {
        throw new Error(JOB_CLIENT_EMAIL_NO_CLIENT);
      }
      return saveJobClientEmail({
        clientId: emailRow.clientId,
        email: clientEmailDraft,
      });
    },
    onSuccess: (result) => {
      setEmailOverride(result.email);
      setClientEmailDraft(result.email ?? '');
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['inspection-due-client', result.clientId] });
      const toast = jobClientEmailSaveToast(result.email);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const savePhone = useMutation({
    mutationFn: async () => {
      if (phoneRow.kind !== 'edit') {
        throw new Error(JOB_CLIENT_PHONE_NO_CLIENT);
      }
      return saveJobClientPhone({
        clientId: phoneRow.clientId,
        phone: clientPhoneDraft,
      });
    },
    onSuccess: (result) => {
      setPhoneOverride(result.phone);
      setClientPhoneDraft(result.phone ?? '');
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['inspection-due-client', result.clientId] });
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!decision.send) {
        throw new Error(decision.message);
      }
      const { data, error } = await supabase.functions.invoke('job-reminder', {
        body: {
          inspectionId: inspection.id,
          appUrl: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      if (data?.sent === false) {
        throw new Error(String(data.message ?? data.results?.[0]?.message ?? 'Reminder was not sent.'));
      }
      return data as { sent: boolean; message?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inspection', inspection.id] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['job-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['client-inspections'] });
      showToast(data.message ?? `Reminder sent to ${to}${smsTo ? '' : ` ${missSmsMessage('no_phone')}`}`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const sentAt = inspection.due_reminder_sent_at;

  return (
    <div id="inspection-due" className="ops-tray job-reminder">
      <div className="ops-tray-head">
        <h2 className="ops-section-title">Due test reminder</h2>
      </div>
      <div className="job-reminder-body">
        {noEmailFieldMiss && (
          <p className="job-reminder-miss">{DUE_REMINDER_NO_EMAIL_FIELD}</p>
        )}
        {noPhoneFieldMiss && (
          <p className="job-reminder-miss">{DUE_REMINDER_NO_PHONE_FIELD}</p>
        )}

        <div className="job-reminder-tos">
          <label className="block">
            <span className="ops-field-label">To</span>
            {emailRow.kind === 'edit' ? (
              <form
                className="job-client-email"
                onSubmit={e => {
                  e.preventDefault();
                  saveEmail.mutate();
                }}
              >
                <Mail size={13} />
                <input
                  type="email"
                  value={clientEmailDraft}
                  onChange={e => setClientEmailDraft(e.target.value)}
                  placeholder="Email"
                  className="form-input-sm"
                  aria-label="Client email"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  className="job-client-email-save"
                  disabled={saveEmail.isPending}
                >
                  Save
                </button>
              </form>
            ) : (
              <input
                type="email"
                readOnly
                value={to}
                placeholder="No client email"
                className="form-input"
                aria-label="Due reminder recipient"
              />
            )}
          </label>

          <label className="block">
            <span className="ops-field-label">SMS To</span>
            {phoneRow.kind === 'edit' ? (
              <form
                className="job-client-phone"
                onSubmit={e => {
                  e.preventDefault();
                  savePhone.mutate();
                }}
              >
                <Phone size={13} />
                <input
                  type="tel"
                  value={clientPhoneDraft}
                  onChange={e => setClientPhoneDraft(e.target.value)}
                  placeholder="Phone"
                  className="form-input-sm tabular-nums"
                  aria-label="Client phone"
                  autoComplete="tel"
                  inputMode="tel"
                />
                <button
                  type="submit"
                  className="job-client-phone-save"
                  disabled={savePhone.isPending}
                >
                  Save
                </button>
              </form>
            ) : (
              <input
                type="tel"
                readOnly
                value={smsTo}
                placeholder="No client phone"
                className="form-input tabular-nums"
                aria-label="Due reminder SMS To"
              />
            )}
          </label>
        </div>

        {awaitingSmtp ? (
          <p className="job-reminder-meta">Checking email settings…</p>
        ) : decision.send ? (
          <p className="job-reminder-meta">Auto-sends the day it is due (Australia/Perth).</p>
        ) : noEmailFieldMiss || noClientFieldMiss || noClientsNamedMiss ? null : (
          <p className="job-reminder-miss">{missText}</p>
        )}

        {noClientFieldMiss && (
          <p className="job-reminder-miss">{DUE_REMINDER_NO_CLIENT_FIELD}</p>
        )}
        {attachRow.kind === 'pick' && (
          <form
            className="job-client-attach"
            onSubmit={e => {
              e.preventDefault();
              attachClient.mutate();
            }}
          >
            <User size={13} />
            <select
              value={clientAttachDraft}
              onChange={e => setClientAttachDraft(e.target.value)}
              className="form-input-sm"
              aria-label="Attach client"
            >
              <option value="">Client</option>
              {attachRow.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="job-client-attach-save"
              disabled={attachClient.isPending || !clientAttachDraft}
            >
              Save
            </button>
          </form>
        )}
        {noClientsNamedMiss && (
          <p className="job-reminder-miss">{JOB_CLIENT_ATTACH_NO_CLIENTS}</p>
        )}

        {decision.send && !smsTo && !noPhoneFieldMiss && (
          <p className="job-reminder-miss">{missSmsMessage('no_phone')}</p>
        )}

        {sentAt && (
          <p className="job-reminder-meta">
            Reminded <span className="tabular-nums">{new Date(sentAt).toLocaleString()}</span>
            {decision.send ? '' : ' — last successful send.'}
          </p>
        )}

        <div className="job-reminder-act">
          <button
            type="button"
            className="btn-primary"
            disabled={awaitingSmtp || !decision.send || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? 'Sending…' : 'Send due reminder'}
          </button>
          <details className="job-reminder-more">
            <summary aria-label="More">
              <MoreHorizontal size={16} />
            </summary>
            <div className="job-reminder-more-menu">
              <Link to="/settings/company">Email settings</Link>
              {job?.id && <Link to={`/jobs/${job.id}`}>Job</Link>}
              <Link to={inspectionDueHref(inspection.id)}>Inspection</Link>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
