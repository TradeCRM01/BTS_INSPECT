import { describe, expect, it } from 'vitest';
import foundations from '../../supabase/migrations/20260923020000_missed_call_companies_foundations.sql?raw';
import phase2a from '../../supabase/migrations/20260923021000_missed_call_companies_phase_2a.sql?raw';
import phase2b from '../../supabase/migrations/20260923022000_missed_call_companies_phase_2b.sql?raw';
import phase2c from '../../supabase/migrations/20260923023000_missed_call_companies_phase_2c.sql?raw';
import config from '../../supabase/config.toml?raw';
import bookingWorker from '../../supabase/functions/missed-call-booking-worker/index.ts?raw';
import smsWorker from '../../supabase/functions/missed-call-sms-worker/index.ts?raw';
import inboundWebhook from '../../supabase/functions/twilio-inbound/index.ts?raw';
import voiceWebhook from '../../supabase/functions/twilio-voice-status/index.ts?raw';

const migrations = [foundations, phase2a, phase2b, phase2c].join('\n');

describe('companies missed-call forward migrations', () => {
  it('keeps the missed-call tenant key while linking it to companies membership', () => {
    expect(migrations).toContain(
      'organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE',
    );
    expect(migrations).toContain('SELECT profiles.company_id');
    expect(migrations).not.toContain('REFERENCES public.organisations');
    expect(migrations).not.toContain('profiles.organisation_id');
  });

  it('adopts the existing sender table and preserves sender-based tenant routing', () => {
    expect(migrations).toContain(
      'CREATE TABLE IF NOT EXISTS public.organisation_twilio_senders',
    );
    expect(migrations).toContain(
      'WHERE sender.active\n    AND sender.phone_e164 = p_to_phone_e164\n    AND sender.provider_account_sid = p_provider_account_sid',
    );
    expect(migrations).toContain(
      'FOREIGN KEY (organisation_id, sender_id)\n    REFERENCES public.organisation_twilio_senders(organisation_id, id)',
    );
  });

  it('bridges automation records to the companies-era base columns', () => {
    expect(migrations).toContain(
      'FOREIGN KEY (company_id, automation_ref)\n    REFERENCES public.sms_messages(organisation_id, id)',
    );
    expect(migrations).toContain(
      'FOREIGN KEY (organisation_id, booked_job_id)\n    REFERENCES public.jobs(company_id, id)',
    );
    expect(migrations).toContain('WHERE client.company_id = v_command.organisation_id');
    expect(migrations).toContain('WHERE profile.company_id = v_command.organisation_id');
    expect(migrations).toContain('scheduled_date,\n    start_time,\n    end_time,');
    expect(migrations).toContain("(v_command.booking_time + interval '1 hour')::time");
    expect(migrations).not.toContain('FROM public.job_visits');
  });

  it('does not alter the organisations reference schema when its migration target advances', () => {
    expect(migrations.match(/to_regclass\('public\.organisations'\) IS NOT NULL/g)).toHaveLength(4);
    expect(migrations.match(/Skipping companies missed-call Phase/g)).toHaveLength(4);
  });
});

describe('missed-call Edge Function tenant resolution', () => {
  it('does not read the legacy organisations table and keeps public Twilio webhooks JWT-free', () => {
    const functions = [
      inboundWebhook,
      voiceWebhook,
      smsWorker,
      bookingWorker,
    ].join('\n');

    expect(functions).not.toContain('organisations');
    expect(config).toMatch(/\[functions\.twilio-inbound\]\nverify_jwt = false/);
    expect(config).toMatch(/\[functions\.twilio-voice-status\]\nverify_jwt = false/);
    expect(config).toMatch(/\[functions\.missed-call-sms-worker\]\nverify_jwt = false/);
    expect(config).toMatch(/\[functions\.missed-call-booking-worker\]\nverify_jwt = false/);
  });
});
