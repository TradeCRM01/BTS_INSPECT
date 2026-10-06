import { Link } from 'react-router-dom';
import {
  COMPANY_INVOICE_SHARE_SETUP_NUDGE,
  COMPANY_SETTINGS_HREF,
} from '../../lib/companyPaymentMethods';

export function DocumentShareCompanySetupNudge() {
  return (
    <p className="hub-invoice-send-company-nudge" role="status">
      {COMPANY_INVOICE_SHARE_SETUP_NUDGE}{' '}
      <Link to={COMPANY_SETTINGS_HREF}>Company Settings</Link>
    </p>
  );
}
