import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MoreHorizontal, Phone, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui';
import type { Client, Job } from '../../types/crm';
import {
  decideReminderSend,
  jobScheduleHref,
  missSmsMessage,
  prefillReminderTo,
  prefillSmsTo,
  type ReminderEmailSettings,
} from '../../lib/jobReminder';
import {
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  attachJobClient,
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
export const JOB_REMINDER_NO_EMAIL_FIELD =
  'This client has no email. Add one below before you send.';

/** Honest no_phone miss on this tray — write the number on SMS To. Not a failed-send line. */
export const JOB_REMINDER_NO_PHONE_FIELD =
  'This client has no phone. Add one below before you send.';

/** Honest no-client miss on this tray — pick an existing client below. Not a failed-send line. */
export const JOB_REMINDER_NO_CLIENT_FIELD =
  'This job has no client. Add one below before you send.';

export function JobClientReminder({
  job,
  client,
  company,
  rescheduleAsked = false,
}: {
  job: Job;
  client: Client | null;
  company: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  rescheduleAsked?: boolean;
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
  const emailRow = jobClientEmailRow({
    clientId: job.client_id,
    client: liveClient,
  });
  const phoneRow = jobClientPhoneRow({
    clientId: job.client_id,
    client: liveClient,
  });
  const to = prefillReminderTo(liveClient);
  const smsTo = prefillSmsTo(liveClient?.phone);
  const companyId = company?.id ?? job.company_id;
  const noClientMiss = !job.client_id;

  const attachClientsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['job-attach-clients', companyId],
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
    enabled: noClientMiss && !!companyId,
  });
  const attachRow = jobClientAttachRow({
    jobClientId: job.client_id,
    companyClients: job.client_id
      ? []
      : attachClientsQuery.isFetched
        ? (attachClientsQuery.data ?? [])
        : null,
  });
  const noClientsNamedMiss = noClientMiss && attachRow.kind === 'miss';

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

  const decision = decideReminderSend({
    job,
    client: liveClient,
    settings: settings ?? null,
    company: company ?? {},
    companyId,
    appUrl: typeof window !== 'undefined' ? window.location.origin : '',
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
    && noClientMiss
    && attachRow.kind !== 'miss'
    && !decision.send
    && decision.reason === 'no_email';
  const missText = noEmailFieldMiss
    ? JOB_REMINDER_NO_EMAIL_FIELD
    : noClientFieldMiss
      ? JOB_REMINDER_NO_CLIENT_FIELD
      : (noClientsNamedMiss && !decision.send && decision.reason === 'no_email')
        ? JOB_CLIENT_ATTACH_NO_CLIENTS
        : (!decision.send ? decision.message : '');

  useEffect(() => {
    setClientAttachDraft('');
    setEmailOverride(undefined);
    setClientEmailDraft(client?.email ?? '');
    setPhoneOverride(undefined);
    setClientPhoneDraft(client?.phone ?? '');
  }, [job.id, client?.id, client?.email, client?.phone]);

  useEffect(() => {
    if (!rescheduleAsked) return;
    document.getElementById('job-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [rescheduleAsked, job.id]);

  const attachClient = useMutation({
    mutationFn: async () => {
      return attachJobClient({
        jobId: job.id,
        jobClientId: job.client_id,
        clientId: clientAttachDraft,
        companyClients: attachClientsQuery.data ?? [],
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
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
          jobId: job.id,
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
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      showToast(data.message ?? `Reminder sent to ${to}${smsTo ? '' : ` ${missSmsMessage('no_phone')}`}`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const sentAt = job.client_reminder_sent_at;

  return (
    <div className="ops-tray job-reminder">
      <div className="ops-tray-head">
        <h2 className="ops-section-title">24h client reminder</h2>
      </div>
      <div className="job-reminder-body">
        {rescheduleAsked && (
          <p className="job-reminder-reschedule">Client asked to reschedule.</p>
        )}

        {noEmailFieldMiss && (
          <p className="job-reminder-miss">{JOB_REMINDER_NO_EMAIL_FIELD}</p>
        )}
        {noPhoneFieldMiss && (
          <p className="job-reminder-miss">{JOB_REMINDER_NO_PHONE_FIELD}</p>
        )}
        {noClientFieldMiss && (
          <p className="job-reminder-miss">{JOB_REMINDER_NO_CLIENT_FIELD}</p>
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
                aria-label="Reminder recipient"
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
                aria-label="Reminder SMS To"
              />
            )}
          </label>
        </div>

        {awaitingSmtp ? (
          <p className="job-reminder-meta">Checking email settings…</p>
        ) : decision.send ? (
          <p className="job-reminder-meta">Auto-sends the day before (Australia/Perth).</p>
        ) : noEmailFieldMiss || noClientFieldMiss || noClientsNamedMiss ? null : (
          <p className="job-reminder-miss">{missText}</p>
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
            {send.isPending ? 'Sending…' : 'Send tomorrow reminder'}
          </button>
          <details className="job-reminder-more">
            <summary aria-label="More">
              <MoreHorizontal size={16} />
            </summary>
            <div className="job-reminder-more-menu">
              {decision.send && (
                <a href={decision.rescheduleMailto}>Reschedule reply</a>
              )}
              <Link to="/settings/company">Email settings</Link>
              <Link to={jobScheduleHref(job.id)}>Job schedule</Link>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
