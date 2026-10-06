-- Rollback 087_invoice_payments_update_rls (do not run on production without approval).
DROP POLICY IF EXISTS "Company members can update invoice payments" ON invoice_payments;
