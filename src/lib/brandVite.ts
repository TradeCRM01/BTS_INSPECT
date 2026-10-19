import { applyBrandHtml, brandManifestFields } from './brand';

export const brandHtmlPlugin = {
  name: 'brand-html',
  transformIndexHtml(html: string) {
    return applyBrandHtml(html);
  },
};

export function brandPwaManifest(): { name: string; short_name: string } {
  return brandManifestFields();
}
