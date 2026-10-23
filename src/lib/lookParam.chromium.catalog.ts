export type LookCase = {
  value: string;
  search?: string;
  fixtures: string[];
};

export type LookPageKill = {
  id: string;
  file: string;
  component: string;
  path: string;
  looks: LookCase[];
  wait: string;
  live?: string[];
};

export const LOOK_PAGE_KILLS: LookPageKill[] = [
  {
    id: 'dashboard',
    file: 'src/pages/DashboardPage.tsx',
    component: 'DashboardPage',
    path: '/',
    wait: '[data-dashboard-home="1"], .dashboard-home, .shell-header',
    looks: [
      { value: 'dashboard', fixtures: ['Thursday 3 September', 'Northside Electrical'] },
      { value: 'dashboard-seed', fixtures: ['Thursday 3 September', 'Northside Electrical'] },
      { value: 'dashboard-repro', fixtures: ['Thursday 3 September'] },
      { value: 'dashboard-jack', fixtures: ['Thursday 3 September'] },
      { value: 'crew-s8d-dashboard-needs', fixtures: ['Thursday 3 September'] },
    ],
  },
  {
    id: 'clients',
    file: 'src/pages/ClientsPage.tsx',
    component: 'ClientsPage',
    path: '/clients',
    wait: '.hub-clients, .shell-header',
    live: ['Owen Price — delete ok'],
    looks: [{ value: 'clients-list', fixtures: ['Northside Electrical'] }],
  },
  {
    id: 'jobs',
    file: 'src/pages/JobsPage.tsx',
    component: 'JobsPage',
    path: '/jobs',
    wait: '.hub-jobs, .shell-header',
    live: ['Mixer tap', 'Owen Price — delete ok'],
    looks: [
      { value: 'jobs-list', fixtures: ['Northside Electrical'] },
      { value: 'enquiries', fixtures: ['From missed call'] },
      { value: 'enquiries-empty', fixtures: ['No enquiries yet'] },
      { value: 'enquiries-one', fixtures: ['From missed call'] },
    ],
  },
  {
    id: 'inspections',
    file: 'src/pages/InspectionsPage.tsx',
    component: 'InspectionsPage',
    path: '/inspections',
    wait: '.hub-inspections, .shell-header',
    looks: [{ value: 'inspections-list', fixtures: ['Northside Electrical'] }],
  },
  {
    id: 'jha',
    file: 'src/pages/JhaDocumentsPage.tsx',
    component: 'JhaDocumentsPage',
    path: '/jha',
    wait: '.hub-jha, .shell-header',
    looks: [{ value: 'jha-list', fixtures: ['Northside Electrical'] }],
  },
  {
    id: 'take5',
    file: 'src/pages/Take5ListPage.tsx',
    component: 'Take5ListPage',
    path: '/jha/take5',
    wait: '.hub-take5, .shell-header',
    looks: [{ value: 'take5-list', fixtures: ['Northside Electrical'] }],
  },
  {
    id: 'drive',
    file: 'src/pages/ReportsListPage.tsx',
    component: 'ReportsListPage',
    path: '/drive',
    wait: '.hub-reports, .shell-header',
    looks: [
      { value: 'reports-list', fixtures: ['RPT-2002'] },
      { value: 'drive-error', fixtures: ["Couldn't load reports"] },
    ],
  },
  {
    id: 'schedule',
    file: 'src/pages/SchedulePage.tsx',
    component: 'SchedulePage',
    path: '/schedule',
    wait: '.hub-week, .hub-schedule, .shell-header',
    looks: [
      { value: 'week-board', fixtures: ['Site measure'] },
      { value: 'fix3a-schedule', fixtures: ['Heat pump service'] },
    ],
  },
  {
    id: 'price-books',
    file: 'src/pages/PriceBooksPage.tsx',
    component: 'PriceBooksPage',
    path: '/price-books',
    wait: '.shell-header',
    looks: [{ value: 'price-books', fixtures: ['Site labour'] }],
  },
  {
    id: 'compliance',
    file: 'src/pages/CompliancePage.tsx',
    component: 'CompliancePage',
    path: '/compliance',
    wait: '.hub-compliance, .shell-header',
    looks: [
      { value: 'compliance-list', fixtures: ['Annual RCD test'] },
      { value: 'hotfix-date-bad', fixtures: ['Backflow test delete ok'] },
    ],
  },
  {
    id: 'team',
    file: 'src/pages/TeamSettingsPage.tsx',
    component: 'TeamSettingsPage',
    path: '/settings/team',
    wait: '.hub-team, .shell-header',
    looks: [
      { value: 'team-list', fixtures: ['Alex Nguyen'] },
      { value: 'person-tickets', fixtures: ['Alex Nguyen'] },
      { value: 'p331-team-select', fixtures: ['Alex Nguyen'] },
      { value: 'p331-team-empty', fixtures: ['Alex Nguyen'] },
      { value: 'p331-team-fail', fixtures: ['Alex Nguyen'] },
      { value: 'p331-team-persist', fixtures: ['Alex Nguyen'] },
    ],
  },
  {
    id: 'templates',
    file: 'src/pages/TemplatesPage.tsx',
    component: 'TemplatesPage',
    path: '/templates',
    wait: '.shell-header',
    looks: [{ value: 'templates-snapshot', fixtures: ['Switchboard'] }],
  },
  {
    id: 'quotes',
    file: 'src/pages/QuotesPage.tsx',
    component: 'QuotesPage',
    path: '/quotes',
    wait: '.shell-header',
    looks: [
      { value: 'letterhead', fixtures: ['#2002', 'Northside Electrical'] },
      { value: 'sweep7-issued', fixtures: ['Northside Electrical'] },
    ],
  },
  {
    id: 'invoices',
    file: 'src/pages/InvoicesPage.tsx',
    component: 'InvoicesPage',
    path: '/invoices',
    wait: '.shell-header',
    looks: [
      { value: 'letterhead', fixtures: ['#2002', 'Northside Electrical'] },
      { value: 'invoice-edit-paid', fixtures: ['#2002'] },
      { value: 'invoice-edit-edit', fixtures: ['#2002'] },
      { value: 'invoice-edit-pdf', fixtures: ['#2002'] },
      { value: 'sweep7-issued', fixtures: ['#2002'] },
    ],
  },
  {
    id: 'expenses',
    file: 'src/pages/ExpensesPage.tsx',
    component: 'ExpensesPage',
    path: '/expenses',
    wait: '.hub-expenses, .shell-header',
    looks: [
      { value: 'expense1-empty', fixtures: ['What kind of cost is this?'] },
      { value: 'expense1-filled', fixtures: ['— delete ok'] },
      { value: 'scan-bunnings', fixtures: ['Bunnings'] },
      { value: 'scan-overhead', fixtures: ['CBRE Property'] },
    ],
  },
  {
    id: 'company',
    file: 'src/pages/CompanySettingsPage.tsx',
    component: 'CompanySettingsPage',
    path: '/settings/company',
    wait: '.shell-header',
    looks: [
      { value: 'letterhead', fixtures: ['wordmark-padded-field-audit.png'] },
      { value: 'sms-settings', fixtures: ['Field Audit Co'] },
      { value: 'sms-settings-invalid', fixtures: ['Twenty Character Name!'] },
    ],
  },
];

export const LOOK_PROOF_SCAN_KEYS = [
  'look',
  'expenseNoAi',
  'auditAuth',
  'operatorAudit',
  'auditBillingFail',
  'scanReceipt',
  'unscheduled',
  'early',
  'empty',
  'payment',
  'trades',
  'auditName',
] as const;

/** Product query keys that may be read outside lookParam.ts. Proof keys are not listed. */
export const SEARCH_PARAM_ALLOWLIST = [
  'id',
  'tab',
  'view',
  'date',
  'send',
  'print',
  'chase',
  'reschedule',
  'checkout',
  'status',
  'client',
  'job',
  'templateId',
  'docId',
  'jobId',
  'clientId',
  'crmJobId',
  'jhaId',
  'crewId',
  't',
  'token',
  'token_hash',
  'type',
  'next',
  'expired',
  'recovered',
  'error_code',
  'error',
  'error_description',
  'auto',
  'clear',
  'subject',
  'body',
  'code',
  'state',
] as const;

export type LookFillKill = {
  id: string;
  file: string;
  path: string;
  wait: string;
  fixtures: string[];
};

export const LOOK_FILL_KILLS: LookFillKill[] = [
  {
    id: 'inspection-fill',
    file: 'src/pages/InspectionFillPage.tsx',
    path: '/inspections/look-insp-pat?look=inspection-snapshot-view',
    wait: '.hub-inspections, .shell-header',
    fixtures: ['Pat Snapshot', 'Snapshot job'],
  },
  {
    id: 'jha-fill',
    file: 'src/pages/JhaFillPage.tsx',
    path: '/jha/new?look=jha-creator-snapshot',
    wait: '.hub-jha, .shell-header',
    fixtures: ['Pat Snapshot', 'Snapshot Yard'],
  },
];
