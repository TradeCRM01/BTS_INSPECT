-- Local proof for accounting_credentials. Run through scripts/prove-accounting-credentials.sh.
-- Never against production.

\ir ./accounting_credentials_setup.sql
\ir ./accounting_credentials_seed_settings.sql
\ir ../migrations/20261019120000_090_accounting_credentials.sql
\ir ./accounting_credentials_seed_credentials.sql
\ir ./accounting_credentials_assert.sql
\ir ../../docs/operations/rollback-20261019120000_090_accounting_credentials.sql
\ir ../migrations/20261019120000_090_accounting_credentials.sql
\ir ./accounting_credentials_seed_credentials.sql
\ir ./accounting_credentials_assert.sql
