import { applyBrandHtml, brandManifestFields, BRAND_NAME } from './brand';

function runtimeBrandName(): string {
  return process.env.BRAND_NAME || BRAND_NAME;
}

export const brandHtmlPlugin = {
  name: 'brand-html',
  transformIndexHtml(html: string) {
    return applyBrandHtml(html, runtimeBrandName());
  },
};

export function brandPwaManifest(): { name: string; short_name: string } {
  return brandManifestFields(runtimeBrandName());
}
