import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui';
import {
  decideInspectionDueSend,
  inspectionDueHref,
  prefillReminderTo,
  type DueInspection,
  type DueInspectionJob,
} from '../../lib/inspectionDueReminder';
import type { ReminderClient, ReminderEmailSettings } from '../../lib/jobReminder';

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
  const to = prefillReminderTo(client);
  const companyId = company?.id ?? job?.company_id ?? '';

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
    client,
    settings: settings ?? null,
    company: company ?? {},
    companyId,
    appUrl: typeof window !== 'undefined' ? window.location.origin : '',
    mode: 'manual',
  });
  const awaitingSmtp = !settingsFetched && !!companyId;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#inspection-due') return;
    document.getElementById('inspection-due')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [inspection.id]);

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
      showToast(data.message ?? `Reminder sent to ${to}`);
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
        <label className="block">
          <span className="ops-field-label">To</span>
          <input
            type="email"
            readOnly
            value={to}
            placeholder="No client email"
            className="form-input"
            aria-label="Due reminder recipient"
          />
        </label>

        {awaitingSmtp ? (
          <p className="job-reminder-meta">Checking email settings…</p>
        ) : decision.send ? (
          <p className="job-reminder-meta">Auto-sends the day it is due (Australia/Perth).</p>
        ) : (
          <p className="job-reminder-miss">{decision.message}</p>
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
