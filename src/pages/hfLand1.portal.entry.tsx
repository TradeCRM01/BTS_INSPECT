import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../components/ui/Toast';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 portal harness missing #root');

createRoot(rootEl).render(
  <ToastProvider>
    <div id="client-portal" data-theme="light">
      <div className="portal-doc">
        <div className="portal-brand">
          <p className="portal-brand-name">Northside Plumbing &amp; Gas</p>
          <p className="portal-brand-muted">Client portal</p>
        </div>
      </div>
    </div>
  </ToastProvider>,
);
