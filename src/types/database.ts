// Database types for Supabase client typing.
// Uses `any` for all Row/Insert/Update types so that select('*') and
// explicit column selects both resolve to `any`, avoiding type inference
// errors from the postgrest-js v12 select query parser while still
// providing table name autocomplete on .from() calls.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AnyTable = { Row: any; Insert: any; Update: any; Relationships: any[] };

export interface Database {
  public: {
    Tables: {
      companies: AnyTable;
      profiles: AnyTable;
      templates: AnyTable;
      inspections: AnyTable;
      photos: AnyTable;
      reports: AnyTable;
      email_settings: AnyTable;
      jha_templates: AnyTable;
      jha_documents: AnyTable;
      pdf_annotations: AnyTable;
      uploaded_pdfs: AnyTable;
      uploaded_pdf_annotations: AnyTable;
      dashboard_widgets: AnyTable;
      clients: AnyTable;
      jobs: AnyTable;
      suppliers: AnyTable;
      stock_items: AnyTable;
      stock_movements: AnyTable;
      purchase_orders: AnyTable;
      quotes: AnyTable;
      invoices: AnyTable;
      job_costs: AnyTable;
      inspection_renderers: AnyTable;
      ai_console_sessions: AnyTable;
      ai_settings: AnyTable;
      photo_metadata: AnyTable;
      storage_cleanup_queue: AnyTable;
      folders: AnyTable;
      assets: AnyTable;
      asset_maintenance_records: AnyTable;
      service_contracts: AnyTable;
      service_contract_assets: AnyTable;
      price_books: AnyTable;
      price_book_items: AnyTable;
      timesheets: AnyTable;
      timesheet_entries: AnyTable;
      accounting_settings: AnyTable;
      client_portal_tokens: AnyTable;
      barcode_scan_logs: AnyTable;
      kpi_snapshots: AnyTable;
      compliance_items: AnyTable;
      compliance_logs: AnyTable;
      member_tickets: AnyTable;
      platform_operators: AnyTable;
      platform_operator_events: AnyTable;
      platform_company_notes: AnyTable;
    };
    Views: Record<string, never>;
    Functions: {
      is_platform_operator: { Args: Record<string, never>; Returns: boolean };
    };
  };
}
