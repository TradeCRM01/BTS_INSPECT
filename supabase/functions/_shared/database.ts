export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AnyTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      organisations: AnyTable;
      companies: AnyTable;
      profiles: AnyTable;
      clients: AnyTable;
      jobs: AnyTable;
      job_visits: AnyTable;
      agent_reminders: AnyTable;
      organisation_twilio_senders: AnyTable;
      communication_preferences: AnyTable;
      communication_preference_events: AnyTable;
      sms_messages: AnyTable;
      missed_calls: AnyTable;
      missed_call_sms_threads: AnyTable;
      missed_call_booking_commands: AnyTable;
      missed_call_office_reviews: AnyTable;
    };
    Views: Record<string, never>;
    Functions: {
      ingest_twilio_inbound_sms: { Args: Record<string, unknown>; Returns: Json };
      ingest_twilio_voice_status: { Args: Record<string, unknown>; Returns: Json };
      process_next_missed_call_booking: { Args: Record<string, unknown>; Returns: Json };
      claim_next_sms_message: { Args: Record<string, unknown>; Returns: Json[] };
      authorize_sms_dispatch: { Args: Record<string, unknown>; Returns: Json[] };
      complete_sms_dispatch: { Args: Record<string, unknown>; Returns: boolean };
      fail_sms_dispatch: { Args: Record<string, unknown>; Returns: boolean };
    };
  };
}
