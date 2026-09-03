import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT_PNG = 'public/look/wordmark-padded-field-audit.png';
const OUT_SVG = 'public/look/wordmark-padded-field-audit.svg';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;background:#fff">
<canvas id="c" width="1600" height="1000"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, 1600, 1000);

function drawSpaced(text, x, y, tracking) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  return cursor - tracking - x;
}

ctx.font = '800 72px Arial, Helvetica, sans-serif';
const title = 'FIELD AUDIT';
const titleTrack = 3;
const titleW = drawSpaced(title, 0, 0, titleTrack); // dry: fill is empty at 0,0 on white — redo after measure
</script>
</body></html>`);

const stamp = await page.evaluate(() => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');

  function widthSpaced(text, tracking) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + tracking;
    return w - tracking;
  }

  function drawSpaced(text, x, y, tracking) {
    let cursor = x;
    for (const ch of text) {
      ctx.fillText(ch, cursor, y);
      cursor += ctx.measureText(ch).width + tracking;
    }
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 1600, 1000);

  const title = 'FIELD AUDIT';
  const titleSize = 72;
  const titleTrack = 4;
  ctx.font = `800 ${titleSize}px Arial, Helvetica, sans-serif`;
  const titleW = widthSpaced(title, titleTrack);
  const titleMetrics = ctx.measureText('H');
  const titleAscent = titleMetrics.actualBoundingBoxAscent || titleSize * 0.8;
  const titleDescent = titleMetrics.actualBoundingBoxDescent || titleSize * 0.15;

  ctx.font = '600 22px Arial, Helvetica, sans-serif';
  const coTrack = 6;
  const coW = widthSpaced('CO', coTrack);
  const coMetrics = ctx.measureText('C');
  const coAscent = coMetrics.actualBoundingBoxAscent || 18;

  const padX = 14;
  const padTop = 12;
  const padBot = 12;
  const ruleH = 4;
  const gap = 8;
  const stampW = Math.ceil(Math.max(titleW, coW) + padX * 2);
  const stampH = Math.ceil(padTop + titleAscent + titleDescent + gap + ruleH + gap + coAscent + padBot);
  const stampX = Math.round((1600 - stampW) / 2);
  const stampY = Math.round((1000 - stampH) / 2);

  ctx.fillStyle = '#000000';
  ctx.fillRect(stampX, stampY, stampW, stampH);

  const textX = stampX + padX;
  const titleBaseline = stampY + padTop + titleAscent;
  ctx.fillStyle = '#F5F0E6';
  ctx.font = `800 ${titleSize}px Arial, Helvetica, sans-serif`;
  drawSpaced(title, textX, titleBaseline, titleTrack);

  const ruleY = titleBaseline + titleDescent + 6;
  ctx.fillStyle = '#2E75B6';
  ctx.fillRect(textX, ruleY, titleW, ruleH);

  ctx.fillStyle = '#F5F0E6';
  ctx.font = '600 22px Arial, Helvetica, sans-serif';
  drawSpaced('CO', textX, ruleY + ruleH + 8 + coAscent, coTrack);

  return { x: stampX, y: stampY, w: stampW, h: stampH, titleW };
});

const png = await page.locator('#c').screenshot({ type: 'png', omitBackground: false });
writeFileSync(OUT_PNG, png);

writeFileSync(OUT_SVG, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" role="img" aria-label="Field Audit Co padded export">
  <rect width="1600" height="1000" fill="#FFFFFF"/>
  <rect x="${stamp.x}" y="${stamp.y}" width="${stamp.w}" height="${stamp.h}" fill="#000000"/>
  <text x="${stamp.x + 14}" y="${stamp.y + 12 + 58}" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#F5F0E6" letter-spacing="4">FIELD AUDIT</text>
  <rect x="${stamp.x + 14}" y="${stamp.y + stamp.h - 44}" width="${Math.round(stamp.titleW)}" height="4" fill="#2E75B6"/>
  <text x="${stamp.x + 14}" y="${stamp.y + stamp.h - 16}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#F5F0E6" letter-spacing="6">CO</text>
</svg>
`);

await browser.close();
console.log(JSON.stringify({ png: OUT_PNG, svg: OUT_SVG, stamp }, null, 2));
