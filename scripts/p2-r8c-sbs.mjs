#!/usr/bin/env node
// r8c capture kept for history. r9 deleted the invented 390 fixture (CoS ruling).
// Use scripts/p2-r9-sbs.mjs. This file no longer measures or serves a 390 mock.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [resolve(root, 'scripts/p2-r9-sbs.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
