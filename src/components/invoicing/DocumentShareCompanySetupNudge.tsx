import { Link } from 'react-router-dom';
import { COMPANY_SETTINGS_HREF } from '../../lib/companyPaymentMethods';

export function DocumentShareCompanySetupNudge() {
  return (
    <p className="hub-invoice-send-company-nudge" role="status">
      Add your ABN and bank details in{' '}
      <Link to={COMPANY_SETTINGS_HREF} className="hub-invoice-send-company-nudge-link">
        Company Settings
      </Link>{' '}
      first.
    </p>
  );
}
