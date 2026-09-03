import { CompanyLetterheadMark } from './CompanyLetterheadMark';
import { companyLogoPreviewLetterhead, type CompanyLogoCrop } from './companyLogo';

/** Template quote paper on the company logo strip. Crop + size drive the same mark as a real quote. */
export function CompanyLogoQuotePreview({
  src,
  crop,
  sizePx,
}: {
  src: string;
  crop: CompanyLogoCrop | null;
  sizePx: number;
}) {
  const letterhead = companyLogoPreviewLetterhead({ logo_url: src, crop, sizePx });
  return (
    <div
      className="company-logo-strip-preview"
      data-logo-quote-preview
      aria-label="Quote letterhead preview"
    >
      <div className="company-logo-strip-preview-sheet">
        <div className="company-logo-strip-preview-masthead">
          <CompanyLetterheadMark src={src} company={letterhead} />
          <div className="company-logo-strip-preview-doc">
            <p className="company-logo-strip-preview-kicker">Quotation</p>
            <p className="company-logo-strip-preview-title">Quote #2002</p>
            <p className="company-logo-strip-preview-meta">Draft</p>
          </div>
        </div>
      </div>
    </div>
  );
}
