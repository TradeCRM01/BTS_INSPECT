import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/capture-today-language-schedule.mjs <out-dir>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: 'schedule-week-1280', path: '/schedule?auditAuth=1&look=week-board', width: 1280, height: 1100 },
  { name: 'schedule-week-390', path: '/schedule?auditAuth=1&look=week-board', width: 390, height: 844 },
  { name: 'schedule-day-1280', path: '/schedule?auditAuth=1&look=week-board&view=day', width: 1280, height: 1100 },
  { name: 'schedule-day-390', path: '/schedule?auditAuth=1&look=week-board&view=day', width: 390, height: 844 },
  { name: 'today-1280', path: '/?auditAuth=1&look=dashboard', width: 1280, height: 1100 },
  { name: 'today-390', path: '/?auditAuth=1&look=dashboard', width: 390, height: 844 },
];

const MEASURE = `(() => {
  const pick = (sel) => document.querySelector(sel);
  const box = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim().slice(0, 80),
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      letterSpacing: s.letterSpacing,
      lineHeight: s.lineHeight,
      color: s.color,
      background: s.backgroundColor,
      height: Math.round(r.height),
      radius: s.borderRadius,
    };
  };
  const page = document.querySelector('.hub-board-cal, .dashboard-home');
  const title = pick('.hub-week-hero, .today-title');
  const button = pick('.hub-week-page-tools .btn-primary, .today-btn-primary');
  return {
    title: box(title),
    button: box(button),
    pageBg: page ? getComputedStyle(page).backgroundColor : null,
  };
})()`;

function launch() {
  const dir = `${tmpdir()}\\grafter-chrome-${process.pid}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9222',
    `--user-data-dir=${dir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  return chrome;
}

async function waitForJson() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      const page = list.find((row) => row.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // chrome still starting
    }
    await delay(250);
  }
  throw new Error('chrome debugging port did not open');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
}

async function shoot(send, shot) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: 1,
    mobile: shot.width < 500,
  });
  await send('Page.navigate', { url: `${BASE}${shot.path}` });
  for (let i = 0; i < 40; i += 1) {
    const ready = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('.hub-week-hero, .today-title'))`,
      returnByValue: true,
    });
    if (ready.result?.value) break;
    await delay(250);
  }
  await delay(400);
  const measured = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${shot.name}.png`, Buffer.from(shotRes.data, 'base64'));
  return { name: shot.name, width: shot.width, measure: measured.result?.value ?? null };
}

const chrome = launch();
try {
  const url = await waitForJson();
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');
  const rows = [];
  for (const shot of SHOTS) {
    rows.push(await shoot(send, shot));
    console.log('wrote', shot.name);
  }
  writeFileSync(`${OUT}/measures.json`, JSON.stringify(rows, null, 2));
  ws.close();
} finally {
  chrome.kill();
}
