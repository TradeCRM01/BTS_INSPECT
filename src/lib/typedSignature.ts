/** Script-style fonts for typed signatures (loaded via Google Fonts). */
export const SIGNATURE_FONTS = [
  { id: 'dancing', label: 'Dancing Script', family: '"Dancing Script", cursive' },
  { id: 'great-vibes', label: 'Great Vibes', family: '"Great Vibes", cursive' },
  { id: 'allura', label: 'Allura', family: 'Allura, cursive' },
  { id: 'satisfy', label: 'Satisfy', family: 'Satisfy, cursive' },
  { id: 'pacifico', label: 'Pacifico', family: 'Pacifico, cursive' },
] as const;

export type SignatureFontId = (typeof SIGNATURE_FONTS)[number]['id'];

export function signatureFontFamily(id: SignatureFontId | string): string {
  return SIGNATURE_FONTS.find(f => f.id === id)?.family ?? SIGNATURE_FONTS[0].family;
}

/** Render a typed name into a transparent PNG data URL for PDF embedding. */
export async function renderTypedSignature(opts: {
  name: string;
  fontId?: SignatureFontId | string;
  width?: number;
  height?: number;
}): Promise<string> {
  const name = opts.name.trim();
  if (!name) throw new Error('Enter a name to create a typed signature');

  const fontId = opts.fontId ?? 'dancing';
  const family = signatureFontFamily(fontId);
  const width = opts.width ?? 560;
  const height = opts.height ?? 160;

  // Ensure webfonts are ready before measuring/drawing
  if (typeof document !== 'undefined' && document.fonts?.load) {
    try {
      await document.fonts.load(`64px ${family}`);
      await document.fonts.ready;
    } catch {
      // Fall through — browser will use fallback cursive
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create signature canvas');

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0A2540';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = 64;
  ctx.font = `${fontSize}px ${family}`;
  while (fontSize > 28 && ctx.measureText(name).width > width - 40) {
    fontSize -= 2;
    ctx.font = `${fontSize}px ${family}`;
  }
  ctx.fillText(name, width / 2, height / 2 + 4);

  return canvas.toDataURL('image/png');
}
