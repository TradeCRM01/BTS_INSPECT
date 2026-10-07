import { supabase } from './supabase';

export type AiSettingsGetResponse = {
  keySet?: boolean;
  maskedKey?: string;
  model?: string;
  adminToolsEnabled?: boolean;
  error?: string;
};

export async function fetchAiSettings(): Promise<AiSettingsGetResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-settings`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json() as Promise<AiSettingsGetResponse>;
}

export async function postAiSettings(body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-settings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
