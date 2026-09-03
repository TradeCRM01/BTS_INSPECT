import { CompanyLetterheadMark } from './CompanyLetterheadMark';
import { companyLogoPreviewLetterhead, type CompanyLogoCrop } from './companyLogo';

/** Template quote paper on the company logo strip. Crop + size drive the same mark as a real quote. */
export function CompanyLogoQuotePreview({
  src,
  crop,
  sizePx,
  companyName,
}: {
  src: string;
  crop: CompanyLogoCrop | null;
  sizePx: number;
  companyName?: string;
}) {
  const letterhead = companyLogoPreviewLetterhead({ logo_url: src, crop, sizePx });
  const fromName = companyName?.trim() || 'Your company';
  return (
    <div className="company-logo-strip-quote" data-logo-quote-preview>
      <p className="company-logo-strip-quote-kicker">On a quote</p>
      <div className="hub-quote-sheet company-logo-strip-quote-paper">
        <div className="hub-quote-letterhead">
          <div className="min-w-0">
            <CompanyLetterheadMark src={src} company={letterhead} />
            <p className="hub-quote-kicker">From</p>
            <p className="hub-quote-from-name">{fromName}</p>
          </div>
          <div className="min-w-0 company-logo-strip-quote-heading">
            <p className="hub-quote-kicker">Quotation</p>
            <p className="company-logo-strip-quote-title">Quote #1001</p>
          </div>
        </div>
        <p className="company-logo-strip-quote-line">Switchboard test · 1 × $220.00</p>
      </div>
    </div>
  );
}
