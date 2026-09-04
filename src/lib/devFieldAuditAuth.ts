import type { Session, User } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { LETTERHEAD_LOOK } from './companyLogo';

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
    if (params.get('operatorAudit') === '1') {
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
    if (
      params.get('auditAuth') === '1'
      || params.get('look') === LETTERHEAD_LOOK
      || params.get('look') === 'person-tickets'
      || params.get('look') === 'team-list'
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
  name: 'Field Audit',
  role: 'admin',
  email: 'field-audit@example.com',
  licence_number: 'EL-12345',
  template_access: 'edit',
} as unknown as Profile;

export const DEV_AUDIT_COMPANY = {
  id: AUDIT_COMPANY_ID,
  created_by: AUDIT_USER_ID,
  name: 'Field Audit Co',
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
} as unknown as Company;
