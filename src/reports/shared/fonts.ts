import { Font } from '@react-pdf/renderer';

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;

  // Roboto via the roboto-fontface npm package on jsDelivr.
  // Includes glyphs for Ω, µ, °, ², ³, and other technical symbols.
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.woff', fontWeight: 400 },
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-RegularItalic.woff', fontWeight: 400, fontStyle: 'italic' },
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.woff', fontWeight: 700 },
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-BoldItalic.woff', fontWeight: 700, fontStyle: 'italic' },
    ],
  });

  Font.register({
    family: 'RobotoMono',
    fonts: [
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.woff', fontWeight: 400 },
      { src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-RegularItalic.woff', fontWeight: 400, fontStyle: 'italic' },
    ],
  });

  Font.register({
    family: 'Newsreader',
    fonts: [
      { src: 'https://cdn.jsdelivr.net/fontsource/fonts/newsreader@5.2.8/latin-600-normal.ttf', fontWeight: 600 },
      { src: 'https://cdn.jsdelivr.net/fontsource/fonts/newsreader@5.2.8/latin-700-normal.ttf', fontWeight: 700 },
    ],
  });
}
