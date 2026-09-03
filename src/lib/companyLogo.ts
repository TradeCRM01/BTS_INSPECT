/** Trade-company mark for invoices, quotes, and reports — not the Grafter / BTS app mark. */

export const COMPANY_LOGOS_BUCKET = 'logos';
/** LOOK query that opens quote/invoice paper with a wordmark that contains company-name lettering. */
export const LETTERHEAD_LOOK = 'letterhead';
/** Repo fixture — letters are drawn in the image, not HTML beside it. */
export const LETTERHEAD_LOOK_MARK = '/look/wordmark-field-audit.png';
/** Wide export with empty padding around a small mark — the live BTS pain. */
export const LETTERHEAD_LOOK_PADDED_MARK = '/look/wordmark-padded-field-audit.png';

export function letterheadLookMarkSrc(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${LETTERHEAD_LOOK_MARK}`;
  }
  return LETTERHEAD_LOOK_MARK;
}

export function letterheadLookPaddedMarkSrc(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${LETTERHEAD_LOOK_PADDED_MARK}`;
  }
  return LETTERHEAD_LOOK_PADDED_MARK;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the company logo to crop it.'));
    img.src = src;
  });
}

/** Cut the focus box out of the stored mark for PDF (react-pdf cannot clip). */
export async function companyLogoCroppedSrc(
  src: string,
  crop: CompanyLogoCrop | null,
): Promise<string> {
  const url = src.trim();
  if (!url || !crop || typeof document === 'undefined') return url;
  const img = await loadHtmlImage(url);
  if (!img.naturalWidth || !img.naturalHeight) return url;
  const sx = img.naturalWidth * crop.x;
  const sy = img.naturalHeight * crop.y;
  const sw = Math.max(1, img.naturalWidth * crop.w);
  const sh = Math.max(1, img.naturalHeight * crop.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) return url;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
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

export function isLetterheadLook(look: string | null | undefined): boolean {
  return look === LETTERHEAD_LOOK;
}

/** Seed the padded export, crop, and letterhead size when ?look=letterhead. */
export function companyWithLetterheadLookMark<T extends {
  logo_url?: string | null;
  logo_crop?: unknown;
  logo_letterhead_size?: number | null;
}>(
  company: T | null | undefined,
  look?: string | null,
): T | null | undefined {
  if (!company || !isLetterheadLook(look)) return company;
  return {
    ...company,
    logo_url: letterheadLookPaddedMarkSrc(),
    logo_crop: LETTERHEAD_LOOK_CROP,
    logo_letterhead_size: LETTERHEAD_LOOK_SIZE,
  };
}

export function companyReportTheme(
  company: { report_theme?: Record<string, unknown> | null } | null | undefined,
): Record<string, unknown> | null {
  const theme = company?.report_theme;
  return theme && typeof theme === 'object' ? theme : null;
}

/** Current quote/invoice letterhead mark height when size is unset. */
export const LETTERHEAD_MARK_DEFAULT_PX = 96;
export const LETTERHEAD_MARK_MIN_PX = 32;
/** Cap so the cropped mark stays in FROM and cannot paint over TO. */
export const LETTERHEAD_MARK_MAX_PX = 120;
/** Matching commercial PDF box when crop/size are unset (today's letterhead). */
export const LETTERHEAD_PDF_DEFAULT = { width: 300, height: 80 } as const;
const LETTERHEAD_PDF_HEIGHT_AT_DEFAULT = LETTERHEAD_PDF_DEFAULT.height;
const LETTERHEAD_PDF_MAX_WIDTH = LETTERHEAD_PDF_DEFAULT.width;

export type CompanyLogoCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
  aspect?: number;
};

/** Focus box that cuts the empty padding on LETTERHEAD_LOOK_PADDED_MARK (1600×1000, mark at 440,428,720×144). */
export const LETTERHEAD_LOOK_CROP: CompanyLogoCrop = {
  x: 0.275,
  y: 0.428,
  w: 0.45,
  h: 0.144,
  aspect: 1.6,
};
/** Cropped mark height on quote/invoice letterhead — PDF weight, still inside FROM. */
export const LETTERHEAD_LOOK_SIZE = LETTERHEAD_MARK_MAX_PX;

export type CompanyLetterheadLogo = {
  logo_url?: string | null;
  logo_crop?: unknown;
  logo_letterhead_size?: number | null;
};

function asUnit(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Null when unset or unusable — letterhead falls back to the full stored mark. */
export function parseCompanyLogoCrop(raw: unknown): CompanyLogoCrop | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const x = asUnit(row.x);
  const y = asUnit(row.y);
  const w = asUnit(row.w ?? row.width);
  const h = asUnit(row.h ?? row.height);
  if (x == null || y == null || w == null || h == null) return null;
  if (w <= 0.01 || h <= 0.01) return null;
  const crop: CompanyLogoCrop = {
    x: clamp01(x),
    y: clamp01(y),
    w: Math.min(1 - clamp01(x), Math.max(0.01, w)),
    h: Math.min(1 - clamp01(y), Math.max(0.01, h)),
  };
  const aspect = asUnit(row.aspect);
  if (aspect != null && aspect > 0.05 && aspect < 40) crop.aspect = aspect;
  if (crop.w >= 0.98 && crop.h >= 0.98 && crop.x <= 0.01 && crop.y <= 0.01) return null;
  return crop;
}

export function parseCompanyLogoLetterheadSize(raw: unknown): number | null {
  const n = asUnit(raw);
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded < LETTERHEAD_MARK_MIN_PX || rounded > LETTERHEAD_MARK_MAX_PX) return null;
  return rounded;
}

export function companyLogoLetterheadSizePx(
  company: { logo_letterhead_size?: unknown } | null | undefined,
): number {
  return parseCompanyLogoLetterheadSize(company?.logo_letterhead_size) ?? LETTERHEAD_MARK_DEFAULT_PX;
}

export function companyLogoCropFrom(
  company: { logo_crop?: unknown } | null | undefined,
): CompanyLogoCrop | null {
  return parseCompanyLogoCrop(company?.logo_crop);
}

export function companyLogoLetterheadSaveRow(
  crop: CompanyLogoCrop | null,
  sizePx: number | null,
): { logo_crop: CompanyLogoCrop | null; logo_letterhead_size: number | null } {
  const size = parseCompanyLogoLetterheadSize(sizePx);
  return {
    logo_crop: parseCompanyLogoCrop(crop),
    logo_letterhead_size: size === LETTERHEAD_MARK_DEFAULT_PX ? null : size,
  };
}

export function letterheadMarkCssVars(
  company: CompanyLetterheadLogo | null | undefined,
  measuredAspect?: number | null,
): {
  '--hub-letterhead-mark-height': string;
  '--logo-crop-x': string;
  '--logo-crop-y': string;
  '--logo-crop-w': string;
  '--logo-crop-h': string;
  '--logo-aspect': string;
} {
  const crop = companyLogoCropFrom(company);
  const size = companyLogoLetterheadSizePx(company);
  const aspect = crop?.aspect ?? (measuredAspect && measuredAspect > 0 ? measuredAspect : 1);
  return {
    '--hub-letterhead-mark-height': `${size}px`,
    '--logo-crop-x': String(crop?.x ?? 0),
    '--logo-crop-y': String(crop?.y ?? 0),
    '--logo-crop-w': String(crop?.w ?? 1),
    '--logo-crop-h': String(crop?.h ?? 1),
    '--logo-aspect': String(aspect),
  };
}

export function letterheadMarkIsFull(
  company: CompanyLetterheadLogo | null | undefined,
): boolean {
  return companyLogoCropFrom(company) == null;
}

/** Default size stays inside the FROM column (max-width 100% + overflow hidden). */
export function letterheadMarkCoversTo(sizePx: number): boolean {
  return sizePx > LETTERHEAD_MARK_MAX_PX;
}

export function commercialPdfLogoBox(company: CompanyLetterheadLogo | null | undefined): {
  width: number;
  height: number;
  crop: CompanyLogoCrop | null;
} {
  const crop = companyLogoCropFrom(company);
  const size = companyLogoLetterheadSizePx(company);
  const scale = size / LETTERHEAD_MARK_DEFAULT_PX;
  if (!crop) {
    return {
      width: Math.round(LETTERHEAD_PDF_DEFAULT.width * scale),
      height: Math.round(LETTERHEAD_PDF_DEFAULT.height * scale),
      crop: null,
    };
  }
  const height = Math.round(LETTERHEAD_PDF_HEIGHT_AT_DEFAULT * scale);
  const aspect = crop.aspect ?? 1;
  const width = Math.min(
    LETTERHEAD_PDF_MAX_WIDTH,
    Math.max(40, Math.round(height * aspect * (crop.w / crop.h))),
  );
  return { width, height: Math.max(24, height), crop };
}

export type CompanyLogoLetterheadClient = {
  saveLetterhead: (
    companyId: string,
    row: { logo_crop: CompanyLogoCrop | null; logo_letterhead_size: number | null },
  ) => Promise<{ error: { message: string } | null }>;
};

export async function persistCompanyLogoLetterhead(
  client: CompanyLogoLetterheadClient,
  args: { companyId: string; crop: CompanyLogoCrop | null; sizePx: number | null },
): Promise<
  | { ok: true; companyId: string; logo_crop: CompanyLogoCrop | null; logo_letterhead_size: number | null }
  | CompanyLogoMiss
> {
  const companyId = args.companyId.trim();
  if (!companyId) {
    return { ok: false, reason: 'no_company', message: COMPANY_LOGO_NO_COMPANY };
  }
  const row = companyLogoLetterheadSaveRow(args.crop, args.sizePx);
  const { error } = await client.saveLetterhead(companyId, row);
  if (error) {
    return { ok: false, reason: 'upload_failed', message: error.message || COMPANY_LOGO_UPLOAD_FAILED };
  }
  return { ok: true, companyId, ...row };
}

export function companyLogoLetterheadClientFromSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
): CompanyLogoLetterheadClient {
  return {
    saveLetterhead: async (companyId, row) => {
      const { error } = await supabase.from('companies').update(row).eq('id', companyId);
      return { error };
    },
  };
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
  logo_crop?: unknown;
  logo_letterhead_size?: number | null;
  report_theme?: Record<string, unknown> | null;
}): {
  name: string;
  abn: string | null;
  licence_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  logo_crop: CompanyLogoCrop | null;
  logo_letterhead_size: number | null;
  report_theme: Record<string, unknown> | null;
} {
  return {
    name: company.name,
    abn: company.abn ?? null,
    licence_number: company.licence_number ?? null,
    phone: company.phone ?? null,
    email: company.email ?? null,
    website: company.website ?? null,
    logo_url: companyDocumentLogoUrl(company),
    logo_crop: companyLogoCropFrom(company),
    logo_letterhead_size: parseCompanyLogoLetterheadSize(company.logo_letterhead_size),
    report_theme: companyReportTheme(company),
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
