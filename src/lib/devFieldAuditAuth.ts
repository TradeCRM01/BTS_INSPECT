import type { Session, User } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { LETTERHEAD_LOOK } from './companyLogo';
import { lookParam } from './lookParam';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Company = Database['public']['Tables']['companies']['Row'];

const AUDIT_KEY = 'grafter-audit-auth';
const OPERATOR_AUDIT_KEY = 'grafter-operator-audit';
const AUDIT_USER_ID = '00000000-0000-0000-0000-000000000002';
const AUDIT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

/**
 * DEV-only mock session so the operator console can be opened without live SQL.
 * Armed by ?operatorAudit=1. Never true in production builds.
 * Does not grant operator access to a real company-admin session.
 */
export function isDevOperatorAudit(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (lookParam(params, 'operatorAudit') === '1') {
      sessionStorage.setItem(OPERATOR_AUDIT_KEY, '1');
      sessionStorage.setItem(AUDIT_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(OPERATOR_AUDIT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * DEV-only mock session so field-audit can open real settings pages.
 * Never true in production builds. Armed by /__field-audit or ?auditAuth=1
 * (and by operator audit, which reuses the mock session).
 */
export function isDevFieldAuditAuth(): boolean {
  if (!import.meta.env.DEV) return false;
  if (isDevOperatorAudit()) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    const look = lookParam(params);
    if (
      lookParam(params, 'auditAuth') === '1'
      || look === LETTERHEAD_LOOK
      || look === 'person-tickets'
      || look === 'team-list'
      || look === 'dashboard'
      || look === 'dashboard-seed'
      || look === 'dashboard-repro'
      || look === 'visit-notes'
      || look === 'job-photos'
      || look === 'week-board'
      || look === 'price-books'
      || look === 'enquiries'
      || look === 'enquiries-empty'
      || look === 'enquiries-one'
      || look === 'jobs-prod-schema'
      || look === 'conversation'
      || look === 'conversation-empty'
      || look === 'sms-settings'
      || look === 'sms-settings-invalid'
      || look === 'hotfix-date-bad'
      || look === 'ai-settings'
      || look === 'ai-console'
      || look === 'drive-error'
      || look === 'inspections-list'
      || look === 'inspection-snapshot-view'
      || look === 'inspection-snapshot-edit'
      || look === 'inspection-issued-view'
      || look === 'inspection-issued-edit'
      || window.location.pathname === '/__field-audit'
    ) {
      sessionStorage.setItem(AUDIT_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(AUDIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableDevFieldAuditAuth(): void {
  if (!import.meta.env.DEV) return;
  try {
    sessionStorage.setItem(AUDIT_KEY, '1');
  } catch {
    // sessionStorage may be unavailable
  }
}

/** DEV-only: simulate billed-id fetch failure (empty set, billingCheckOk false). */
export function isDevAuditBillingFetchFail(): boolean {
  if (!import.meta.env.DEV || !isDevFieldAuditAuth()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return lookParam(params, 'auditBillingFail') === '1';
  } catch {
    return false;
  }
}

/** True when a failed list query should hide the page. Never in the DEV field-audit session. */
export function pageQueryBlocked(error: unknown): boolean {
  return Boolean(error) && !isDevFieldAuditAuth();
}

export const DEV_AUDIT_USER = {
  id: AUDIT_USER_ID,
  email: 'field-audit@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as User;

export const DEV_AUDIT_SESSION = {
  access_token: 'dev-field-audit',
  refresh_token: 'dev-field-audit',
  expires_in: 3600,
  token_type: 'bearer',
  user: DEV_AUDIT_USER,
} as unknown as Session;

export const DEV_AUDIT_PROFILE = {
  id: AUDIT_USER_ID,
  company_id: AUDIT_COMPANY_ID,
  name: devAuditName('Field Audit'),
  role: 'admin',
  email: 'field-audit@example.com',
  licence_number: 'EL-12345',
  template_access: 'edit',
} as unknown as Profile;

/** Lets the harness stand up a multi-trade company with ?trades=plumbing,electrical. */
function devAuditCompanyTrades(): string[] {
  if (!import.meta.env.DEV) return [];
  try {
    const raw = lookParam(new URLSearchParams(window.location.search), 'trades');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** DEV-only: ?auditName= overrides the mock profile and company names. */
function devAuditName(fallback: string): string {
  if (!import.meta.env.DEV) return fallback;
  try {
    const n = lookParam(new URLSearchParams(window.location.search), 'auditName');
    return n && n.trim() ? n.trim() : fallback;
  } catch {
    return fallback;
  }
}

export const DEV_AUDIT_COMPANY = {
  id: AUDIT_COMPANY_ID,
  created_by: AUDIT_USER_ID,
  name: devAuditName('Field Audit Co'),
  abn: '12 345 678 901',
  licence_number: 'EC-9988',
  phone: '08 1234 5678',
  email: 'office@field-audit.example.com',
  website: 'www.field-audit.example.com',
  default_tax_rate: 10,
  default_material_markup: 20,
  logo_url: null,
  access_status: 'active',
  billing_status: 'trial',
  plan: 'crew',
  trial_ends_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  seat_limit: 5,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trades: devAuditCompanyTrades(),
  time_zone: 'Australia/Brisbane',
} as unknown as Company;
