export type Env = {
  PAPER: KVNamespace;
  PAPER_TZ: string;
  PAPER_DEMO?: string;
  PAPER_URL: string;
  PAPER_NOON?: string;
  PAPER_TOKEN?: string;

  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_TO?: string;

  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  MAIL_ME?: string;

  GRAFTER_SUPABASE_URL?: string;
  GRAFTER_SERVICE_KEY?: string;
};

export function isDemo(env: Env): boolean {
  return env.PAPER_DEMO === 'true' || env.PAPER_DEMO === '1';
}

export function noonHour(env: Env): number {
  const n = Number(env.PAPER_NOON ?? 12);
  return Number.isFinite(n) ? n : 12;
}
