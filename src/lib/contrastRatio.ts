export function srgbChannel(channel: number): number {
  const x = channel / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function parseCssColor(value: string): [number, number, number] | null {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

export function contrastRatio(fg: string, bg: string): number {
  const a = parseCssColor(fg);
  const b = parseCssColor(bg);
  if (!a || !b) return 0;
  const hi = Math.max(relativeLuminance(...a), relativeLuminance(...b));
  const lo = Math.min(relativeLuminance(...a), relativeLuminance(...b));
  return (hi + 0.05) / (lo + 0.05);
}

export function cssVarColor(el: Element, name: string): string {
  let value = getComputedStyle(el).getPropertyValue(name).trim();
  if (value.startsWith('var(')) {
    const inner = value.slice(4, -1).split(',')[0].trim();
    return cssVarColor(el, inner);
  }
  return value;
}

export function paintedFill(el: Element, host: Element): string {
  const attr = el.getAttribute('fill') || '';
  if (attr.startsWith('var(')) {
    const name = attr.slice(4, -1).split(',')[0].trim();
    return cssVarColor(host, name);
  }
  if (attr.startsWith('#') || /^rgb/i.test(attr)) return attr;
  return getComputedStyle(el as HTMLElement).fill;
}
