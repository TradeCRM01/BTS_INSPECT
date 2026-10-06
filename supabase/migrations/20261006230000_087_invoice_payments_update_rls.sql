-- 087: UPDATE RLS on invoice_payments (MONEY-4 Remove hotfix).
-- remove_invoice_payment does SELECT … FOR UPDATE on invoice_payments. Without UPDATE
-- policy, PostgreSQL 17 returns zero rows under RLS → RPC raises "Payment not found".

DROP POLICY IF EXISTS "Company members can update invoice payments" ON invoice_payments;
CREATE POLICY "Company members can update invoice payments"
  ON invoice_payments FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
