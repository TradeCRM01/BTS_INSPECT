import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui';
import type { Client, Job } from '../../types/crm';
import {
  decideReminderSend,
  isJobDueTomorrow,
  jobScheduleHref,
  prefillReminderTo,
  type ReminderEmailSettings,
} from '../../lib/jobReminder';

export function JobClientReminder({
  job,
  client,
  company,
}: {
  job: Job;
  client: Client | null;
  company: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const rescheduleAsked = params.get('reschedule') === '1';
  const to = prefillReminderTo(client);
  const companyId = company?.id ?? job.company_id;

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
    client,
    settings: settings ?? null,
    company: company ?? {},
    companyId,
    appUrl: typeof window !== 'undefined' ? window.location.origin : '',
  });
  const awaitingSmtp = !settingsFetched && !!companyId;

  useEffect(() => {
    if (!rescheduleAsked) return;
    document.getElementById('job-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [rescheduleAsked, job.id]);

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
      showToast(data.message ?? `Reminder sent to ${to}`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const dueTomorrow = isJobDueTomorrow(job);
  const sentAt = job.client_reminder_sent_at;

  return (
    <div className="ops-tray mb-5">
      <div className="ops-tray-head">
        <h2 className="ops-section-title flex items-center gap-1.5">
          <Bell size={14} /> 24h client reminder
        </h2>
        <Link to={jobScheduleHref(job.id)} className="ops-link">
          Job schedule
        </Link>
      </div>
      <div className="px-3 pb-3 pt-2">
        {rescheduleAsked && (
          <p className="ops-meta mb-3">
            Client asked to reschedule — pick a new date on the schedule above. No retype.
          </p>
        )}

        <label className="block mb-3">
          <span className="ops-field-label flex items-center gap-1.5">
            <Mail size={12} /> To
          </span>
          <input
            type="email"
            readOnly
            value={to}
            placeholder="No client email"
            className="form-input bg-zebra"
            aria-label="Reminder recipient"
          />
        </label>

        {awaitingSmtp ? (
          <p className="ops-meta mb-3">Checking email settings…</p>
        ) : decision.send ? (
          <p className="ops-meta mb-3">
            Client is booked tomorrow. The email includes an “I need to reschedule” reply that opens this job schedule.
          </p>
        ) : (
          <p className="ops-meta mb-3">{decision.message}</p>
        )}

        {sentAt && (
          <p className="ops-meta mb-3">
            Reminded {new Date(sentAt).toLocaleString()}
            {decision.send ? '' : ' — last successful send.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={awaitingSmtp || !decision.send || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? 'Sending…' : dueTomorrow ? 'Send tomorrow reminder' : 'Send reminder'}
          </button>
          {decision.send && (
            <a href={decision.rescheduleMailto} className="ops-link text-xs">
              Reschedule reply
            </a>
          )}
          <Link to="/settings/company" className="ops-link text-xs">
            Email settings
          </Link>
        </div>
      </div>
    </div>
  );
}
