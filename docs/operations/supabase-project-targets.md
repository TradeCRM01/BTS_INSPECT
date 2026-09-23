# Supabase project targets

The live Grafter site at `grafter.com.au` uses project `ezszahvwwmbuekpedumf`. Its tenant tables are `public.companies` and `public.profiles.company_id`.

Project `fbtmwpkfyjxamxqjxiaq` is the TradeCRM sandbox and the default migration target. Its tenant tables are `public.organisations` and `public.profiles.organisation_id`.

Check the linked project before any migration command. Apply the `missed_call_companies_*` forward migrations only to the live Grafter project. Do not use the TradeCRM remap migrations as a live schema reference.
