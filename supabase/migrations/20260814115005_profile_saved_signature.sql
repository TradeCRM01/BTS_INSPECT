-- Saved reusable signature (PNG data URL or storage path) on each user profile

alter table public.profiles
  add column if not exists saved_signature text;

comment on column public.profiles.saved_signature is 'User saved signature image as data URL for one-tap signing on JHAs and forms';
