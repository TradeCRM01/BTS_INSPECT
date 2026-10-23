import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { ClientsPage } from '../pages/ClientsPage';
import { CompanySettingsPage } from '../pages/CompanySettingsPage';
import { CompliancePage } from '../pages/CompliancePage';
import { DashboardPage } from '../pages/DashboardPage';
import { ExpensesPage } from '../pages/ExpensesPage';
import { InspectionsPage } from '../pages/InspectionsPage';
import { InvoicesPage } from '../pages/InvoicesPage';
import { JhaDocumentsPage } from '../pages/JhaDocumentsPage';
import { JobsPage } from '../pages/JobsPage';
import { PriceBooksPage } from '../pages/PriceBooksPage';
import { QuotesPage } from '../pages/QuotesPage';
import { ReportsListPage } from '../pages/ReportsListPage';
import { SchedulePage } from '../pages/SchedulePage';
import { Take5Page } from '../pages/Take5Page';
import { TeamSettingsPage } from '../pages/TeamSettingsPage';
import { TemplateAccessRoute } from '../components/layout/TemplateAccessRoute';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { JobDetailPage } from '../pages/JobDetailPage';
import { TemplatesPage } from '../pages/TemplatesPage';

type Cfg = { path?: string };
const cfg = ((globalThis as unknown as { __LOOK__?: Cfg }).__LOOK__) ?? {};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lookParam harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/clients']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/inspections" element={<InspectionsPage />} />
          <Route path="/jha" element={<JhaDocumentsPage />} />
          <Route path="/jha/take5" element={<Take5Page />} />
          <Route path="/drive" element={<ReportsListPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/price-books" element={<PriceBooksPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/settings/team" element={<TeamSettingsPage />} />
          <Route path="/templates" element={<TemplateAccessRoute><TemplatesPage /></TemplateAccessRoute>} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/settings/company" element={<CompanySettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
