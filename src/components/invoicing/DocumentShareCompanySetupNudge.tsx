import { Link } from 'react-router-dom';
import {
  COMPANY_SETTINGS_HREF,
  companyInvoiceShareNudgeMessage,
  companyInvoiceShareSetupMiss,
} from '../../lib/companyPaymentMethods';

export function DocumentShareCompanySetupNudge({
  abn,
  paymentMethods,
}: {
  abn?: string | null;
  paymentMethods?: unknown;
}) {
  const miss = companyInvoiceShareSetupMiss(abn, paymentMethods);
  const message = companyInvoiceShareNudgeMessage(miss);
  if (!message) return null;

  return (
    <div className="hub-invoice-send-company-nudge" role="status">
      <p className="hub-invoice-send-company-nudge-text">{message}</p>
      <Link to={COMPANY_SETTINGS_HREF} className="hub-invoice-send-company-nudge-action">
        Add in Settings
      </Link>
    </div>
  );
}
