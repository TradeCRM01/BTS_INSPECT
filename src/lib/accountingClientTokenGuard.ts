import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const TOKEN_KEY = 'access_token|refresh_token|expires_at|token';

function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSrc(next, acc);
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(ts|tsx)$/.test(entry.name)) acc.push(next);
  }
  return acc;
}

function withoutAllowedTokenRegions(source: string): string {
  return source
    .replace(/export const ACCOUNTING_SETTINGS_TOKEN_KEYS\s*=\s*\[[\s\S]*?\]\s*as const\s*;/, '')
    .replace(/export function stripAccountingSettingsTokenKeys[\s\S]*?\n\}/, '')
    .replace(/export function parseXeroTokenResponse[\s\S]*?\n\}/, '')
    .replace(/export function xeroClientResponseHasSecrets[\s\S]*?\n\}/, '');
}

function selectsAccountingTokenColumns(source: string): boolean {
  if (/\.from\(\s*['"]accounting_credentials['"]\s*\)/.test(source)) return true;
  const selectRe = /\.select\(\s*(['"`])([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = selectRe.exec(source))) {
    const cols = match[2];
    if (/\b(access_token|refresh_token)\b/.test(cols)) return true;
    if (/\bexpires_at\b/.test(cols)) {
      const window = source.slice(Math.max(0, match.index - 400), match.index + match[0].length);
      if (/accounting_settings|accounting_credentials/.test(window)) return true;
    }
  }
  return false;
}

function writesTokenKeysOntoSettings(source: string): boolean {
  const scan = withoutAllowedTokenRegions(source);
  const keyWrite = new RegExp(String.raw`\b(?:${TOKEN_KEY})\s*:`);
  const settingsLiteral = new RegExp(
    String.raw`\bsettings\s*[:=]\s*\{[\s\S]{0,1200}?${keyWrite.source}`,
  );
  const settingsAssign = new RegExp(
    String.raw`\bsettings\.(?:access_token|refresh_token|expires_at|token)\s*=`,
  );
  const xeroLiteral = new RegExp(
    String.raw`\bxero\s*[:=]\s*\{[\s\S]{0,1200}?${keyWrite.source}`,
  );
  return settingsLiteral.test(scan) || settingsAssign.test(scan) || xeroLiteral.test(scan);
}

export function sourceLeaksAccountingTokens(source: string): boolean {
  return selectsAccountingTokenColumns(source) || writesTokenKeysOntoSettings(source);
}

export function accountingTokenOffenders(root: string, read: (file: string) => string = (file) => readFileSync(file, 'utf8')): string[] {
  return walkSrc(root)
    .filter((file) => sourceLeaksAccountingTokens(read(file)))
    .map((file) => relative(root, file));
}
