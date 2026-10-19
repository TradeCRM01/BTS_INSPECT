import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const cases = [
  {
    name: 'remove isAuPhone from clientFormFieldErrors',
    file: 'src/lib/fieldValidation.ts',
    from: 'if (!optionalBlank(form.phone, isAuPhone)) errors.phone = FIELD_AU_PHONE;',
    to: 'if (false && !optionalBlank(form.phone, isAuPhone)) errors.phone = FIELD_AU_PHONE;',
    test: 'src/pages/clientFormValidation.test.tsx',
  },
  {
    name: 'remove isEmail from clientFormFieldErrors',
    file: 'src/lib/fieldValidation.ts',
    from: 'if (!optionalBlank(form.email, isEmail)) errors.email = FIELD_EMAIL;',
    to: 'if (false && !optionalBlank(form.email, isEmail)) errors.email = FIELD_EMAIL;',
    test: 'src/pages/clientFormValidation.test.tsx',
  },
  {
    name: 'remove companyDetailsFieldErrors on Save Changes',
    file: 'src/pages/CompanySettingsPage.tsx',
    from: 'if (Object.keys(nextErrors).length) return;',
    to: 'if (false && Object.keys(nextErrors).length) return;',
    test: 'src/pages/companySettingsValidation.test.tsx',
  },
];

const results = [];
for (const item of cases) {
  const original = readFileSync(item.file, 'utf8');
  if (!original.includes(item.from)) {
    results.push({ name: item.name, killed: false, reason: 'pattern missing' });
    continue;
  }
  writeFileSync(item.file, original.replace(item.from, item.to));
  let failed = false;
  let detail = '';
  try {
    execFileSync('npx', ['vitest', 'run', item.test, '--testTimeout=15000'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    detail = 'tests still passed';
  } catch (err) {
    failed = true;
    detail = (err.stdout?.toString() || err.stderr?.toString() || 'failed').slice(-400);
  }
  writeFileSync(item.file, original);
  results.push({ name: item.name, killed: failed, detail });
}

console.log(JSON.stringify(results, null, 2));
const missed = results.filter(row => !row.killed);
if (missed.length) {
  console.error('UNKILLED', missed.map(row => row.name).join(', '));
  process.exit(1);
}
