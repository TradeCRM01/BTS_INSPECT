import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { OperatorRoute } from './components/layout/OperatorRoute';
import { PageErrorBoundary } from './components/layout/PageErrorBoundary';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { ToastProvider } from './components/ui/Toast';

// Public pages — small, load immediately
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AuthConfirmPage } from './pages/AuthConfirmPage';
import { RootPage } from './pages/RootPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

// Protected pages — code-split so only the visited page is parsed
const TemplatesPage = lazy(() => import('./pages/TemplatesPage').then(m => ({ default: m.TemplatesPage })));
const TemplateEditorPage = lazy(() => import('./pages/TemplateEditorPage').then(m => ({ default: m.TemplateEditorPage })));
const InspectionsPage = lazy(() => import('./pages/InspectionsPage').then(m => ({ default: m.InspectionsPage })));
const NewInspectionPage = lazy(() => import('./pages/NewInspectionPage').then(m => ({ default: m.NewInspectionPage })));
const InspectionFillPage = lazy(() => import('./pages/InspectionFillPage').then(m => ({ default: m.InspectionFillPage })));
const InspectionReviewPage = lazy(() => import('./pages/InspectionReviewPage').then(m => ({ default: m.InspectionReviewPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then(m => ({ default: m.ReportPage })));
const ReportsListPage = lazy(() => import('./pages/ReportsListPage').then(m => ({ default: m.ReportsListPage })));
const UploadedPdfViewerPage = lazy(() => import('./pages/UploadedPdfViewerPage').then(m => ({ default: m.UploadedPdfViewerPage })));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage').then(m => ({ default: m.ProfileSettingsPage })));
const CompanySettingsPage = lazy(() => import('./pages/CompanySettingsPage').then(m => ({ default: m.CompanySettingsPage })));
const BillingSettingsPage = lazy(() => import('./pages/BillingSettingsPage').then(m => ({ default: m.BillingSettingsPage })));
const TeamSettingsPage = lazy(() => import('./pages/TeamSettingsPage').then(m => ({ default: m.TeamSettingsPage })));
const AiConsolePage = lazy(() => import('./pages/AiConsolePage').then(m => ({ default: m.AiConsolePage })));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage').then(m => ({ default: m.AiAssistantPage })));
const AiSettingsPage = lazy(() => import('./pages/AiSettingsPage').then(m => ({ default: m.AiSettingsPage })));
const JhaTemplateEditorPage = lazy(() => import('./pages/JhaTemplateEditorPage').then(m => ({ default: m.JhaTemplateEditorPage })));
const JhaFillPage = lazy(() => import('./pages/JhaFillPage').then(m => ({ default: m.JhaFillPage })));
const JhaDocumentsPage = lazy(() => import('./pages/JhaDocumentsPage').then(m => ({ default: m.JhaDocumentsPage })));
const SwmsLibraryPage = lazy(() => import('./pages/SwmsLibraryPage').then(m => ({ default: m.SwmsLibraryPage })));
const Take5Page = lazy(() => import('./pages/Take5Page').then(m => ({ default: m.Take5Page })));
const JhaCrewSignPage = lazy(() => import('./pages/JhaCrewSignPage').then(m => ({ default: m.JhaCrewSignPage })));
const ClientsPage = lazy(() => import('./pages/ClientsPage').then(m => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })));
const StockPage = lazy(() => import('./pages/StockPage').then(m => ({ default: m.StockPage })));
const StockLocationPage = lazy(() => import('./pages/StockLocationPage').then(m => ({ default: m.StockLocationPage })));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage').then(m => ({ default: m.StockDetailPage })));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const SupplierDetailPage = lazy(() => import('./pages/SupplierDetailPage').then(m => ({ default: m.SupplierDetailPage })));
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const QuotesPage = lazy(() => import('./pages/QuotesPage').then(m => ({ default: m.QuotesPage })));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage').then(m => ({ default: m.InvoicesPage })));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then(m => ({ default: m.AssetsPage })));
const ContractsPage = lazy(() => import('./pages/ContractsPage').then(m => ({ default: m.ContractsPage })));
const PriceBooksPage = lazy(() => import('./pages/PriceBooksPage').then(m => ({ default: m.PriceBooksPage })));
const TimesheetsPage = lazy(() => import('./pages/TimesheetsPage').then(m => ({ default: m.TimesheetsPage })));
const AdvancedReportsPage = lazy(() => import('./pages/AdvancedReportsPage').then(m => ({ default: m.AdvancedReportsPage })));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage').then(m => ({ default: m.CustomerPortalPage })));
const ClientPortalPublicPage = lazy(() => import('./pages/ClientPortalPublicPage').then(m => ({ default: m.ClientPortalPublicPage })));
const AccountingSettingsPage = lazy(() => import('./pages/AccountingSettingsPage').then(m => ({ default: m.AccountingSettingsPage })));
const BarcodeScannerPage = lazy(() => import('./pages/BarcodeScannerPage').then(m => ({ default: m.BarcodeScannerPage })));
const ManagedListsSettingsPage = lazy(() => import('./pages/ManagedListsSettingsPage').then(m => ({ default: m.ManagedListsSettingsPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then(m => ({ default: m.JobsPage })));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage').then(m => ({ default: m.JobDetailPage })));
const CompliancePage = lazy(() => import('./pages/CompliancePage').then(m => ({ default: m.CompliancePage })));
const FieldAuditPage = lazy(() => import('./pages/FieldAuditPage').then(m => ({ default: m.FieldAuditPage })));
const OperatorOverviewPage = lazy(() => import('./pages/operator/OperatorOverviewPage').then(m => ({ default: m.OperatorOverviewPage })));
const OperatorCompaniesPage = lazy(() => import('./pages/operator/OperatorCompaniesPage').then(m => ({ default: m.OperatorCompaniesPage })));
const OperatorCompanyDetailPage = lazy(() => import('./pages/operator/OperatorCompanyDetailPage').then(m => ({ default: m.OperatorCompanyDetailPage })));
const OperatorBillingPage = lazy(() => import('./pages/operator/OperatorBillingPage').then(m => ({ default: m.OperatorBillingPage })));
const OperatorAuditPage = lazy(() => import('./pages/operator/OperatorAuditPage').then(m => ({ default: m.OperatorAuditPage })));
const OperatorOperatorsPage = lazy(() => import('./pages/operator/OperatorOperatorsPage').then(m => ({ default: m.OperatorOperatorsPage })));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <PageErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </PageErrorBoundary>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <ToastProvider>
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/confirm" element={<AuthConfirmPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/p"
        element={
          <PageErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <ClientPortalPublicPage />
            </Suspense>
          </PageErrorBoundary>
        }
      />

      {/* Protected routes — each page is a separate JS chunk */}
      <Route path="/" element={<RootPage />} />
      <Route path="/templates" element={<Protected><TemplatesPage /></Protected>} />
      <Route path="/templates/new" element={<Protected><TemplateEditorPage /></Protected>} />
      <Route path="/templates/:id" element={<Protected><TemplateEditorPage /></Protected>} />
      <Route path="/inspections" element={<Protected><InspectionsPage /></Protected>} />
      <Route path="/inspections/new" element={<Protected><NewInspectionPage /></Protected>} />
      <Route path="/inspections/:id" element={<Protected><InspectionFillPage /></Protected>} />
      <Route path="/inspections/:id/review" element={<Protected><InspectionReviewPage /></Protected>} />
      <Route path="/inspections/:id/report" element={<Protected><ReportPage /></Protected>} />
      <Route path="/drive" element={<Protected><ReportsListPage /></Protected>} />
      <Route path="/drive/folder/:folderId" element={<Protected><ReportsListPage /></Protected>} />
      <Route path="/reports" element={<Navigate to="/drive" replace />} />
      <Route path="/uploaded-pdfs/:id" element={<Protected><UploadedPdfViewerPage /></Protected>} />
      <Route path="/settings/profile" element={<Protected><ProfileSettingsPage /></Protected>} />
      <Route path="/settings/company" element={<Protected><CompanySettingsPage /></Protected>} />
      <Route path="/settings/billing" element={<Protected><BillingSettingsPage /></Protected>} />
      <Route path="/settings/team" element={<Protected><TeamSettingsPage /></Protected>} />
      <Route path="/ai-console" element={<Protected><AiConsolePage /></Protected>} />
      <Route path="/assistant" element={<Protected><AiAssistantPage /></Protected>} />
      <Route path="/settings/ai" element={<Protected><AiSettingsPage /></Protected>} />
      <Route path="/jha-templates" element={<Navigate to="/templates" replace />} />
      <Route path="/jha-templates/new" element={<Protected><JhaTemplateEditorPage /></Protected>} />
      <Route path="/jha-templates/:id" element={<Protected><JhaTemplateEditorPage /></Protected>} />
      <Route path="/jha" element={<Protected><JhaDocumentsPage /></Protected>} />
      <Route path="/jha/swms-library" element={<Protected><SwmsLibraryPage /></Protected>} />
      <Route path="/jha/new" element={<Protected><JhaFillPage /></Protected>} />
      <Route path="/jha/take5" element={<Protected><Take5Page /></Protected>} />
      <Route path="/jha/crew-sign" element={<Protected><JhaCrewSignPage /></Protected>} />
      <Route path="/clients" element={<Protected><ClientsPage /></Protected>} />
      <Route path="/clients/:id" element={<Protected><ClientDetailPage /></Protected>} />
      <Route path="/stock" element={<Protected><StockPage /></Protected>} />
      <Route path="/stock/locations/:locationKey" element={<Protected><StockLocationPage /></Protected>} />
      <Route path="/stock/:id" element={<Protected><StockDetailPage /></Protected>} />
      <Route path="/suppliers" element={<Protected><SuppliersPage /></Protected>} />
      <Route path="/suppliers/:id" element={<Protected><SupplierDetailPage /></Protected>} />
      <Route path="/purchase-orders" element={<Protected><PurchaseOrdersPage /></Protected>} />
      <Route path="/schedule" element={<Protected><SchedulePage /></Protected>} />
      <Route path="/quotes" element={<Protected><QuotesPage /></Protected>} />
      <Route path="/invoices" element={<Protected><InvoicesPage /></Protected>} />
      <Route path="/expenses" element={<Protected><ExpensesPage /></Protected>} />
      <Route path="/assets" element={<Protected><AssetsPage /></Protected>} />
      <Route path="/contracts" element={<Protected><ContractsPage /></Protected>} />
      <Route path="/price-books" element={<Protected><PriceBooksPage /></Protected>} />
      <Route path="/timesheets" element={<Protected><TimesheetsPage /></Protected>} />
      <Route path="/reports-advanced" element={<Protected><AdvancedReportsPage /></Protected>} />
      <Route path="/portal" element={<Protected><CustomerPortalPage /></Protected>} />
      <Route path="/settings/accounting" element={<Protected><AccountingSettingsPage /></Protected>} />
      <Route path="/barcode" element={<Protected><BarcodeScannerPage /></Protected>} />
      <Route path="/settings/lists" element={<Protected><ManagedListsSettingsPage /></Protected>} />
      <Route path="/jobs" element={<Protected><JobsPage /></Protected>} />
      <Route path="/jobs/:id" element={<Protected><JobDetailPage /></Protected>} />
      <Route path="/compliance" element={<Protected><CompliancePage /></Protected>} />
      <Route path="/operator" element={<Protected><OperatorRoute><OperatorOverviewPage /></OperatorRoute></Protected>} />
      <Route path="/operator/companies" element={<Protected><OperatorRoute><OperatorCompaniesPage /></OperatorRoute></Protected>} />
      <Route path="/operator/companies/:id" element={<Protected><OperatorRoute><OperatorCompanyDetailPage /></OperatorRoute></Protected>} />
      <Route path="/operator/billing" element={<Protected><OperatorRoute><OperatorBillingPage /></OperatorRoute></Protected>} />
      <Route path="/operator/audit" element={<Protected><OperatorRoute><OperatorAuditPage /></OperatorRoute></Protected>} />
      <Route path="/operator/operators" element={<Protected><OperatorRoute><OperatorOperatorsPage /></OperatorRoute></Protected>} />

      {import.meta.env.DEV ? (
        <Route
          path="/__field-audit"
          element={
            <PageErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <FieldAuditPage />
              </Suspense>
            </PageErrorBoundary>
          }
        />
      ) : null}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ToastProvider>
  );
}
