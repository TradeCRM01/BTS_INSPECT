/** Trade-company mark for invoices, quotes, and reports — not the Grafter / BTS app mark. */

export const COMPANY_LOGOS_BUCKET = 'logos';
export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const COMPANY_LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';

export const COMPANY_LOGO_INVALID_FILE = 'That file is not a company logo we can use.';
export const COMPANY_LOGO_TOO_LARGE = 'That logo is too large (5 MB max).';
export const COMPANY_LOGO_NO_COMPANY = 'No company to store this logo on.';
export const COMPANY_LOGO_NO_FILE = 'Pick a logo file first.';
export const COMPANY_LOGO_UPLOAD_FAILED = 'Could not store the company logo.';
export const COMPANY_LOGO_REMOVE_FAILED = 'Could not remove the company logo.';

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]);

const ALLOWED_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

export type CompanyLogoFileIn = {
  type?: string | null;
  size?: number | null;
  name?: string | null;
};

export type CompanyLogoUploadOk = {
  ok: true;
  companyId: string;
  path: string;
  contentType: string;
};

export type CompanyLogoMiss = {
  ok: false;
  reason: 'no_company' | 'no_file' | 'invalid_file' | 'too_large' | 'upload_failed' | 'remove_failed';
  message: string;
};

export function companyLogoStoragePath(companyId: string): string {
  return `${companyId.trim()}/logo.png`;
}

/**
 * The customer's mark on documents. Blank / whitespace stays empty.
 * Never invents a Grafter G, BtsMark, or BrandLockup fallback.
 */
export function companyDocumentLogoUrl(
  company: { logo_url?: string | null } | null | undefined,
): string | null {
  const url = typeof company?.logo_url === 'string' ? company.logo_url.trim() : '';
  return url || null;
}

/** Invoice / quote letterhead company block. Logo is the stored company mark or omitted. */
export function commercialPdfCompanyFrom(company: {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
}): {
  name: string;
  abn: string | null;
  licence_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
} {
  return {
    name: company.name,
    abn: company.abn ?? null,
    licence_number: company.licence_number ?? null,
    phone: company.phone ?? null,
    email: company.email ?? null,
    website: company.website ?? null,
    logo_url: companyDocumentLogoUrl(company),
  };
}

export function companyLogoOnDocuments(
  company: { logo_url?: string | null } | null | undefined,
): { invoice: string | null; quote: string | null; report: string | null } {
  const logo_url = companyDocumentLogoUrl(company);
  return { invoice: logo_url, quote: logo_url, report: logo_url };
}

function guessContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export function decideCompanyLogoUpload(args: {
  companyId?: string | null;
  file?: CompanyLogoFileIn | null;
}): CompanyLogoUploadOk | CompanyLogoMiss {
  const companyId = (args.companyId ?? '').trim();
  if (!companyId) {
    return { ok: false, reason: 'no_company', message: COMPANY_LOGO_NO_COMPANY };
  }
  const file = args.file;
  if (!file) {
    return { ok: false, reason: 'no_file', message: COMPANY_LOGO_NO_FILE };
  }
  const type = (file.type ?? '').toLowerCase().trim();
  const name = file.name ?? '';
  const size = Number(file.size) || 0;
  const typeOk = ALLOWED_TYPES.has(type);
  const extOk = ALLOWED_EXT.test(name);
  if (!typeOk && !extOk) {
    return { ok: false, reason: 'invalid_file', message: COMPANY_LOGO_INVALID_FILE };
  }
  if (type && !typeOk && !type.startsWith('image/')) {
    return { ok: false, reason: 'invalid_file', message: COMPANY_LOGO_INVALID_FILE };
  }
  if (size <= 0) {
    return { ok: false, reason: 'invalid_file', message: COMPANY_LOGO_INVALID_FILE };
  }
  if (size > COMPANY_LOGO_MAX_BYTES) {
    return { ok: false, reason: 'too_large', message: COMPANY_LOGO_TOO_LARGE };
  }
  return {
    ok: true,
    companyId,
    path: companyLogoStoragePath(companyId),
    contentType: typeOk ? (type === 'image/jpg' ? 'image/jpeg' : type) : guessContentType(name),
  };
}

export type CompanyLogoClient = {
  upload: (
    path: string,
    body: Blob,
    opts: { contentType: string; upsert: boolean },
  ) => Promise<{ error: { message: string } | null }>;
  publicUrl: (path: string) => string;
  removeObject?: (path: string) => Promise<{ error: { message: string } | null }>;
  saveLogoUrl: (companyId: string, logoUrl: string | null) => Promise<{ error: { message: string } | null }>;
};

// supabase-js builders are wider than this client; we only call these methods.
export function companyLogoClientFromSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { storage: { from: (bucket: string) => any }; from: (table: string) => any },
): CompanyLogoClient {
  const bucket = () => supabase.storage.from(COMPANY_LOGOS_BUCKET);
  return {
    upload: (path, body, opts) => bucket().upload(path, body, opts),
    publicUrl: (path) => bucket().getPublicUrl(path).data.publicUrl,
    removeObject: async (path) => {
      const { error } = await bucket().remove([path]);
      return { error };
    },
    saveLogoUrl: async (companyId, logoUrl) => {
      const { error } = await supabase.from('companies').update({ logo_url: logoUrl }).eq('id', companyId);
      return { error };
    },
  };
}

export async function persistCompanyLogo(
  client: CompanyLogoClient,
  args: { companyId: string; file: Blob & CompanyLogoFileIn },
): Promise<{ ok: true; logo_url: string; companyId: string } | CompanyLogoMiss> {
  const decision = decideCompanyLogoUpload({ companyId: args.companyId, file: args.file });
  if (!decision.ok) return decision;
  const { error: upErr } = await client.upload(decision.path, args.file, {
    contentType: decision.contentType,
    upsert: true,
  });
  if (upErr) {
    return { ok: false, reason: 'upload_failed', message: upErr.message || COMPANY_LOGO_UPLOAD_FAILED };
  }
  const logo_url = (client.publicUrl(decision.path) ?? '').trim();
  if (!logo_url) {
    return { ok: false, reason: 'upload_failed', message: COMPANY_LOGO_UPLOAD_FAILED };
  }
  const { error: saveErr } = await client.saveLogoUrl(decision.companyId, logo_url);
  if (saveErr) {
    return { ok: false, reason: 'upload_failed', message: saveErr.message || COMPANY_LOGO_UPLOAD_FAILED };
  }
  return { ok: true, logo_url, companyId: decision.companyId };
}

export async function removeCompanyLogo(
  client: CompanyLogoClient,
  companyId: string,
): Promise<{ ok: true; logo_url: null; companyId: string } | CompanyLogoMiss> {
  const id = companyId.trim();
  if (!id) {
    return { ok: false, reason: 'no_company', message: COMPANY_LOGO_NO_COMPANY };
  }
  const { error: saveErr } = await client.saveLogoUrl(id, null);
  if (saveErr) {
    return { ok: false, reason: 'remove_failed', message: saveErr.message || COMPANY_LOGO_REMOVE_FAILED };
  }
  if (client.removeObject) {
    await client.removeObject(companyLogoStoragePath(id));
  }
  return { ok: true, logo_url: null, companyId: id };
}
