import type { Env } from './env';

export type Mail = { subject: string; text: string; html: string };

/** Resend, plain HTTP. Returns false (and logs) when mail is not configured. */
export async function sendMail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.MAIL_TO) {
    console.log('mail: not configured, skipping send');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [env.MAIL_TO], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return true;
}
