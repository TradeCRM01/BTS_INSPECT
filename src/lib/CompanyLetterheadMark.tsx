import { useState, type CSSProperties } from 'react';
import {
  letterheadMarkCssVars,
  letterheadMarkIsFull,
  type CompanyLetterheadLogo,
} from './companyLogo';

/** Cropped, sized company mark for quote/invoice letterhead (screen + print). */
export function CompanyLetterheadMark({
  src,
  company,
}: {
  src: string;
  company?: CompanyLetterheadLogo | null;
}) {
  const [aspect, setAspect] = useState<number | null>(null);
  const full = letterheadMarkIsFull(company);
  const vars = letterheadMarkCssVars(company, aspect) as CSSProperties;
  return (
    <span
      className={full ? 'hub-letterhead-mark-crop is-full' : 'hub-letterhead-mark-crop'}
      style={vars}
      data-letterhead-mark={full ? 'full' : 'crop'}
    >
      <img
        src={src}
        alt=""
        className="hub-letterhead-mark"
        onLoad={e => {
          const el = e.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            setAspect(el.naturalWidth / el.naturalHeight);
          }
        }}
      />
    </span>
  );
}
